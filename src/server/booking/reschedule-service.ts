import "server-only";
import { z } from "zod";
import { checkTrainerFree, hasActiveOverlap, sessionEnd } from "@/lib/booking/availability";
import { categoryLabel } from "@/lib/booking/categories";
import { rankTrainers } from "@/lib/booking/matching";
import { quoteSession, type PriceQuote } from "@/lib/booking/pricing";
import { reschedulePolicyFor, rescheduleBlocker } from "@/lib/booking/reschedule";
import { ACTIVE_BOOKING_STATUSES, BOOKING_HORIZON_DAYS, MAX_RESCHEDULES } from "@/lib/booking/rules";
import { formatINR, fromPaise, toPaise } from "@/lib/pricing";
import { formatSlot } from "@/lib/utils/format";
import type { BookingStatus, WorkoutCategory } from "@/lib/validation/enums";
import { rescheduleBookingInputSchema, rescheduleOptionsQuerySchema } from "@/lib/validation/booking";
import type { Actor } from "@/server/auth/actor";
import { notify, type NewNotification } from "@/server/notifications/notification-service";
import {
  dayRange,
  findAlternatives,
  getSchedule,
  loadCandidatePool,
  loadCustomerBookings,
  loadCustomerContext,
  type CustomerContext,
  type RescheduleScope,
  type ScheduleView,
} from "./availability-service";
import type { BookingDeps } from "./deps";
import { exclusionConstraint, fail, ok, type ServiceResult } from "./errors";
import { loadActivePricing } from "./pricing-service";

/**
 * Moving a confirmed booking to a new time. The booking row is updated in place, so its reference,
 * its payment or package ledger entry and its history stay attached: a move never charges, refunds
 * or redeems anything. See src/lib/booking/reschedule.ts for the policy.
 *
 * Concurrency: the booking row is locked first (so two moves of the same booking, or a move racing a
 * cancel or a session start, serialise), then the target trainer's profile row (the same lock new
 * bookings take, so a move and a new booking can't both claim that trainer's slot). Availability is
 * re-read under both locks, and the Booking_*_no_overlap exclusion constraints back it up in Postgres.
 */

const MAX_TRAINER_ATTEMPTS = 3;

type OwnedBooking = {
  id: string;
  reference: string;
  status: BookingStatus;
  startAt: Date;
  trainerId: string | null;
  packageId: string | null;
  workoutCategory: WorkoutCategory | null;
  totalAmount: string;
  rescheduleCount: number;
  trainerName: string | null;
  packageExpiresAt: Date | null;
};

async function loadOwned(deps: BookingDeps, actor: Actor, bookingId: string) {
  return deps.db.booking.findFirst({
    where: { id: bookingId, customerId: actor.userId },
    select: {
      id: true,
      reference: true,
      status: true,
      startAt: true,
      trainerId: true,
      packageId: true,
      workoutCategory: true,
      totalAmount: true,
      rescheduleCount: true,
      trainer: { select: { user: { select: { name: true } } } },
      package: { select: { expiresAt: true } },
    },
  });
}

async function findOwned(deps: BookingDeps, actor: Actor, bookingId: string): Promise<OwnedBooking | null> {
  const b = await loadOwned(deps, actor, bookingId);
  if (!b) return null;
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    startAt: b.startAt,
    trainerId: b.trainerId,
    packageId: b.packageId,
    workoutCategory: b.workoutCategory,
    // Canonical "438.90" form: Prisma's Decimal prints "438.9", quotes print two decimals.
    totalAmount: fromPaise(toPaise(b.totalAmount)),
    rescheduleCount: b.rescheduleCount,
    trainerName: b.trainer?.user.name ?? null,
    packageExpiresAt: b.package?.expiresAt ?? null,
  };
}

/** What the move must preserve: package bookings any slot, paid bookings the same total. */
function scopeFor(b: OwnedBooking): RescheduleScope {
  return reschedulePolicyFor(b) === "SAME_TOTAL"
    ? { excludeBookingId: b.id, requireTotal: b.totalAmount }
    : { excludeBookingId: b.id };
}

export type RescheduleOptions = {
  bookingId: string;
  reference: string;
  currentStartAt: string;
  trainerName: string | null;
  coverage: "PACKAGE" | "PAYMENT";
  /** Paid bookings: only slots with this total can be chosen. */
  requiredTotal: string | null;
  reschedulesLeft: number;
  schedule: ScheduleView;
};

/** The slot grid for moving one of the acting customer's bookings (its own slot doesn't block it). */
export async function getRescheduleOptions(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<RescheduleOptions>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can move their bookings.");
  const parsed = rescheduleOptionsQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a booking to move.");
  const b = await findOwned(deps, actor, parsed.data.bookingId);
  if (!b) return fail("NOT_FOUND", "We couldn't find that booking.");
  const blocker = rescheduleBlocker(b, deps.now());
  if (blocker) return fail("CONFLICT", blocker);
  if (!b.workoutCategory) return fail("CONFLICT", "This booking has no workout type, so it can't be moved.");
  const customer = await loadCustomerContext(deps.db, actor.userId);
  if (!customer) return fail("NOT_FOUND", "We couldn't find an active customer profile for this account.");

  const scope = scopeFor(b);
  const schedule = await getSchedule(deps, customer, b.workoutCategory, BOOKING_HORIZON_DAYS, scope);
  return ok({
    bookingId: b.id,
    reference: b.reference,
    currentStartAt: b.startAt.toISOString(),
    trainerName: b.trainerName,
    coverage: b.packageId ? "PACKAGE" : "PAYMENT",
    requiredTotal: scope.requireTotal ?? null,
    reschedulesLeft: MAX_RESCHEDULES - b.rescheduleCount,
    schedule,
  });
}

export type RescheduledBooking = {
  id: string;
  reference: string;
  startAt: string;
  trainerName: string;
  /** True when the original trainer couldn't take the new time and another was assigned. */
  trainerChanged: boolean;
  /** True when the booking was already at this time (a repeated request): nothing changed. */
  unchanged: boolean;
};

type MoveOutcome =
  | { kind: "moved"; trainerName: string; trainerChanged: boolean }
  | { kind: "unchanged" }
  | { kind: "booking_changed"; reason: string }
  | { kind: "trainer_unavailable" }
  | { kind: "customer_conflict" };

type Move = {
  booking: OwnedBooking;
  customer: CustomerContext;
  trainerId: string;
  trainerName: string;
  startAt: Date;
  quote: PriceQuote;
};

async function moveTo(deps: BookingDeps, m: Move): Promise<MoveOutcome> {
  const endAt = sessionEnd(m.startAt);
  const category = m.booking.workoutCategory!;
  try {
    return await deps.db.$transaction(async (tx): Promise<MoveOutcome> => {
      // 1. The booking itself: serialises concurrent moves, cancels and session starts of this row.
      const rows = await tx.$queryRaw<
        { status: BookingStatus; startAt: Date; trainerId: string | null; rescheduleCount: number; customerId: string }[]
      >`SELECT "status", "startAt", "trainerId", "rescheduleCount", "customerId"
        FROM "Booking" WHERE "id" = ${m.booking.id} FOR UPDATE`;
      const current = rows[0];
      if (!current || current.customerId !== m.customer.userId) {
        return { kind: "booking_changed", reason: "We couldn't find that booking." };
      }
      if (current.startAt.getTime() === m.startAt.getTime()) return { kind: "unchanged" };
      if (current.startAt.getTime() !== m.booking.startAt.getTime() || current.trainerId !== m.booking.trainerId) {
        return { kind: "booking_changed", reason: "This booking just changed. Refresh and try again." };
      }
      const now = deps.now();
      const blocker = rescheduleBlocker(current, now);
      if (blocker) return { kind: "booking_changed", reason: blocker };

      // 2. The target trainer: the same lock createBooking takes.
      const locked = await tx.$queryRaw<{ isActive: boolean; serviceZoneId: string; workoutCategories: string[] }[]>`
        SELECT "isActive", "serviceZoneId", "workoutCategories"::text[] AS "workoutCategories"
        FROM "TrainerProfile" WHERE "userId" = ${m.trainerId} FOR UPDATE`;
      const trainer = locked[0];
      if (!trainer?.isActive || trainer.serviceZoneId !== m.customer.serviceZoneId || !trainer.workoutCategories.includes(category)) {
        return { kind: "trainer_unavailable" };
      }

      // 3. Re-read availability under the locks, ignoring this booking's own current slot.
      const [windows, clashes] = await Promise.all([
        tx.trainerAvailability.findMany({
          where: { trainerId: m.trainerId, startAt: { lt: endAt }, endAt: { gt: m.startAt } },
          select: { startAt: true, endAt: true, status: true },
        }),
        tx.booking.findMany({
          where: {
            id: { not: m.booking.id },
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
            startAt: { lt: endAt },
            endAt: { gt: m.startAt },
            OR: [{ trainerId: m.trainerId }, { customerId: m.customer.userId }],
          },
          select: { trainerId: true, customerId: true, startAt: true, endAt: true, status: true },
        }),
      ]);
      if (clashes.some((b) => b.customerId === m.customer.userId)) return { kind: "customer_conflict" };
      const free = checkTrainerFree(
        { windows, bookings: clashes.filter((b) => b.trainerId === m.trainerId) },
        m.startAt,
        endAt,
      );
      if (!free.free) return { kind: "trainer_unavailable" };

      // 4. Move it. The price snapshot follows the new slot (equal total for paid bookings, enforced
      // by the caller), so the booking always describes the slot it now holds.
      await tx.booking.update({
        where: { id: m.booking.id },
        data: {
          startAt: m.startAt,
          endAt,
          trainerId: m.trainerId,
          pricingRuleId: m.quote.pricingRuleId,
          isPeak: m.quote.isPeak,
          sessionPrice: m.quote.sessionPrice,
          commissionPercent: m.quote.commissionPercent,
          commissionAmount: m.quote.commissionAmount,
          totalAmount: m.quote.totalAmount,
          rescheduleCount: { increment: 1 },
          lastRescheduledAt: now,
        },
      });

      const tz = m.customer.timeZone;
      const from = formatSlot(m.booking.startAt, tz);
      const to = formatSlot(m.startAt, tz);
      const what = categoryLabel(category);
      const trainerChanged = m.trainerId !== m.booking.trainerId;
      const notes: NewNotification[] = [
        {
          recipientId: m.customer.userId,
          bookingId: m.booking.id,
          type: "BOOKING_RESCHEDULED",
          title: `Booking ${m.booking.reference} moved`,
          message: `${what} moved from ${from} to ${to}${trainerChanged ? `, now with ${m.trainerName}` : ` with ${m.trainerName}`}.`,
        },
      ];
      if (trainerChanged) {
        if (m.booking.trainerId) {
          notes.push({
            recipientId: m.booking.trainerId,
            bookingId: m.booking.id,
            type: "BOOKING_RESCHEDULED",
            title: `Booking ${m.booking.reference} moved off your schedule`,
            message: `${m.customer.name} moved ${what.toLowerCase()} from ${from} to a time another trainer covers. You're no longer booked for it.`,
          });
        }
        notes.push({
          recipientId: m.trainerId,
          bookingId: m.booking.id,
          type: "BOOKING_ASSIGNED",
          title: `New session with ${m.customer.name}`,
          message: `${what} · ${to} · ${m.customer.zoneName} (rescheduled booking ${m.booking.reference})`,
        });
      } else {
        notes.push({
          recipientId: m.trainerId,
          bookingId: m.booking.id,
          type: "BOOKING_RESCHEDULED",
          title: `${m.customer.name} moved their session`,
          message: `${what} (${m.booking.reference}) moved from ${from} to ${to}.`,
        });
      }
      await notify(tx, notes);
      return { kind: "moved", trainerName: m.trainerName, trainerChanged };
    }, deps.tx);
  } catch (err) {
    const constraint = exclusionConstraint(err);
    if (constraint === "Booking_trainer_no_overlap") return { kind: "trainer_unavailable" };
    if (constraint === "Booking_customer_no_overlap") return { kind: "customer_conflict" };
    throw err;
  }
}

/**
 * Move one of the acting customer's confirmed bookings to a new scheduled time. Keeps the current
 * trainer when they are free, otherwise assigns the best-ranked eligible trainer. Repeating the same
 * request after it succeeded is a no-op that reports `unchanged`.
 */
export async function rescheduleBooking(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<RescheduledBooking>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can move their bookings.");
  const parsed = rescheduleBookingInputSchema(deps.now).safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the new time.", {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    });
  }
  const { bookingId, startAt } = parsed.data;

  const b = await findOwned(deps, actor, bookingId);
  if (!b) return fail("NOT_FOUND", "We couldn't find that booking.");
  const unchanged = (): ServiceResult<RescheduledBooking> =>
    ok({
      id: b.id,
      reference: b.reference,
      startAt: startAt.toISOString(),
      trainerName: b.trainerName ?? "your trainer",
      trainerChanged: false,
      unchanged: true,
    });
  if (b.startAt.getTime() === startAt.getTime()) return unchanged();

  const now = deps.now();
  const blocker = rescheduleBlocker(b, now);
  if (blocker) return fail("CONFLICT", blocker);
  if (!b.workoutCategory) return fail("CONFLICT", "This booking has no workout type, so it can't be moved.");
  const customer = await loadCustomerContext(deps.db, actor.userId);
  if (!customer) return fail("NOT_FOUND", "We couldn't find an active customer profile for this account.");

  const tz = customer.timeZone;
  const scope = scopeFor(b);
  const alternatives = () => findAlternatives(deps, customer, b.workoutCategory!, startAt, 3, scope);
  const { from, to } = dayRange(startAt, tz);
  const [pricing, pool, customerBookings] = await Promise.all([
    loadActivePricing(deps.db, now),
    loadCandidatePool(deps.db, {
      serviceZoneId: customer.serviceZoneId,
      category: b.workoutCategory,
      from,
      to,
      excludeBookingId: b.id,
    }),
    loadCustomerBookings(deps.db, customer.userId, from, to, b.id),
  ]);

  const quote = quoteSession(pricing, startAt, tz);
  if (scope.requireTotal && quote.totalAmount !== scope.requireTotal) {
    return fail(
      "PRICE_CHANGED",
      `That time costs ${formatINR(quote.totalAmount)}, not the ${formatINR(scope.requireTotal)} you paid. Choose a time at the same price, or cancel (your simulated payment is refunded in full) and book the new time.`,
      { quote, alternatives: await alternatives() },
    );
  }
  if (b.packageId && b.packageExpiresAt && startAt >= b.packageExpiresAt) {
    return fail("PACKAGE_UNAVAILABLE", "Your package expires before that time. Choose an earlier time.");
  }
  if (hasActiveOverlap(customerBookings, startAt, sessionEnd(startAt))) {
    return fail("CONFLICT", "You already have a session that overlaps this time.", { alternatives: await alternatives() });
  }

  const ranked = rankTrainers(pool.candidates, { category: b.workoutCategory, startAt, timeZone: tz });
  // Continuity first: the current trainer when they're free, then the matcher's usual order.
  const order = [
    ...ranked.filter((t) => t.trainerId === b.trainerId),
    ...ranked.filter((t) => t.trainerId !== b.trainerId),
  ].slice(0, MAX_TRAINER_ATTEMPTS);
  if (order.length === 0) {
    return fail(
      "NO_TRAINER",
      `No trainer is free for ${categoryLabel(b.workoutCategory).toLowerCase()} at ${formatSlot(startAt, tz)}.`,
      { alternatives: await alternatives() },
    );
  }

  for (const t of order) {
    const outcome = await moveTo(deps, { booking: b, customer, trainerId: t.trainerId, trainerName: t.name, startAt, quote });
    switch (outcome.kind) {
      case "moved":
        return ok({
          id: b.id,
          reference: b.reference,
          startAt: startAt.toISOString(),
          trainerName: outcome.trainerName,
          trainerChanged: outcome.trainerChanged,
          unchanged: false,
        });
      case "unchanged":
        return unchanged();
      case "booking_changed":
        return fail("CONFLICT", outcome.reason);
      case "customer_conflict":
        return fail("CONFLICT", "You already have a session that overlaps this time.", {
          alternatives: await alternatives(),
        });
      case "trainer_unavailable":
        continue; // taken between lookup and lock: try the next-ranked trainer
    }
  }
  return fail("SLOT_TAKEN", "That time was just taken. Pick another time.", { alternatives: await alternatives() });
}
