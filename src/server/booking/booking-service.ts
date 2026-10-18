import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { checkTrainerFree, hasActiveOverlap, sessionEnd } from "@/lib/booking/availability";
import { cancellationBlocker } from "@/lib/booking/cancellation";
import { categoryLabel } from "@/lib/booking/categories";
import { INELIGIBLE_MESSAGE, ineligibility, rankTrainers } from "@/lib/booking/matching";
import { quoteSession, type PriceQuote } from "@/lib/booking/pricing";
import { ACTIVE_BOOKING_STATUSES, CANCELLABLE_STATUSES } from "@/lib/booking/rules";
import { formatSlot } from "@/lib/utils/format";
import { cancelBookingInputSchema, createBookingInputSchema } from "@/lib/validation/booking";
import type { Actor } from "@/server/auth/actor";
import {
  dayRange,
  findAlternatives,
  loadCandidatePool,
  loadCustomerBookings,
  loadCustomerContext,
  type CustomerContext,
} from "./availability-service";
import type { BookingDeps } from "./deps";
import { exclusionConstraint, fail, isUniqueViolationOn, ok, type ServiceResult } from "./errors";
import { loadActivePricing } from "./pricing-service";

/** How many ranked trainers to try when the top match is taken between lookup and write. */
const MAX_ASSIGNMENT_ATTEMPTS = 3;
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

function newReference(): string {
  return `ZY-${Array.from({ length: 5 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("")}`;
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

export type CreatedBooking = {
  id: string;
  reference: string;
  startAt: string;
  trainerName: string | null;
  totalAmount: string;
  /** True when this was a retry of a request that had already created the booking. */
  replayed: boolean;
};

type Reservation = {
  trainerId: string;
  trainerName: string;
  customer: CustomerContext;
  startAt: Date;
  endAt: Date;
  quote: PriceQuote;
  input: z.infer<ReturnType<typeof createBookingInputSchema>>;
};

type ReserveOutcome =
  | { kind: "created"; booking: { id: string; reference: string } }
  | { kind: "trainer_unavailable" }
  | { kind: "customer_conflict" }
  | { kind: "duplicate_request" };

/**
 * Reserve one trainer for one slot, atomically.
 *
 *  1. `SELECT … FOR UPDATE` on the trainer's profile row serialises every booking and availability
 *     edit for that trainer. A second request for the same trainer waits here until the first
 *     commits or rolls back.
 *  2. Under the lock, availability windows and overlapping active bookings are re-read (READ
 *     COMMITTED gives each statement a fresh snapshot, so a booking committed by the request we
 *     waited for is visible) and the slot is re-validated.
 *  3. The booking and its notifications are inserted in the same transaction.
 *
 * The `Booking_trainer_no_overlap` / `Booking_customer_no_overlap` exclusion constraints back this
 * up inside Postgres: even a code path that skipped steps 1–2 could not commit an overlap.
 */
async function reserve(deps: BookingDeps, r: Reservation): Promise<ReserveOutcome> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await deps.db.$transaction(async (tx): Promise<ReserveOutcome> => {
        const locked = await tx.$queryRaw<
          { isActive: boolean; serviceZoneId: string; workoutCategories: string[] }[]
        >`SELECT "isActive", "serviceZoneId", "workoutCategories"::text[] AS "workoutCategories"
          FROM "TrainerProfile" WHERE "userId" = ${r.trainerId} FOR UPDATE`;
        const trainer = locked[0];
        if (
          !trainer?.isActive ||
          trainer.serviceZoneId !== r.customer.serviceZoneId ||
          !trainer.workoutCategories.includes(r.input.workoutCategory)
        ) {
          return { kind: "trainer_unavailable" };
        }

        const [windows, clashes] = await Promise.all([
          tx.trainerAvailability.findMany({
            where: { trainerId: r.trainerId, startAt: { lt: r.endAt }, endAt: { gt: r.startAt } },
            select: { startAt: true, endAt: true, status: true },
          }),
          tx.booking.findMany({
            where: {
              status: { in: [...ACTIVE_BOOKING_STATUSES] },
              startAt: { lt: r.endAt },
              endAt: { gt: r.startAt },
              OR: [{ trainerId: r.trainerId }, { customerId: r.customer.userId }],
            },
            select: { trainerId: true, customerId: true, startAt: true, endAt: true, status: true },
          }),
        ]);
        if (clashes.some((b) => b.customerId === r.customer.userId)) return { kind: "customer_conflict" };
        const free = checkTrainerFree(
          { windows, bookings: clashes.filter((b) => b.trainerId === r.trainerId) },
          r.startAt,
          r.endAt,
        );
        if (!free.free) return { kind: "trainer_unavailable" };

        const reference = newReference();
        const booking = await tx.booking.create({
          data: {
            reference,
            customerId: r.customer.userId,
            trainerId: r.trainerId,
            preferredTrainerId: r.input.preferredTrainerId ?? null,
            serviceZoneId: r.customer.serviceZoneId,
            mode: r.input.mode,
            status: "CONFIRMED",
            startAt: r.startAt,
            endAt: r.endAt,
            workoutCategory: r.input.workoutCategory,
            customerNotes: r.input.notes ?? null,
            idempotencyKey: r.input.idempotencyKey,
            // Immutable price snapshot, computed by the server from the active rules.
            pricingRuleId: r.quote.pricingRuleId,
            isPeak: r.quote.isPeak,
            sessionPrice: r.quote.sessionPrice,
            commissionPercent: r.quote.commissionPercent,
            commissionAmount: r.quote.commissionAmount,
            totalAmount: r.quote.totalAmount,
            currency: r.quote.currency,
          },
          select: { id: true, reference: true },
        });

        const when = formatSlot(r.startAt, r.customer.timeZone);
        const what = categoryLabel(r.input.workoutCategory);
        await tx.notification.createMany({
          data: [
            {
              recipientId: r.trainerId,
              bookingId: booking.id,
              type: "BOOKING_ASSIGNED",
              title: `New session with ${r.customer.name}`,
              message: `${what} · ${when} · ${r.customer.zoneName}`,
            },
            {
              recipientId: r.customer.userId,
              bookingId: booking.id,
              type: "BOOKING_ASSIGNED",
              title: `${r.trainerName} is your trainer`,
              message: `${what} on ${when}. Booking ${booking.reference}.`,
            },
          ],
        });
        return { kind: "created", booking };
      }, deps.tx);
    } catch (err) {
      const constraint = exclusionConstraint(err);
      if (constraint === "Booking_trainer_no_overlap") return { kind: "trainer_unavailable" };
      if (constraint === "Booking_customer_no_overlap") return { kind: "customer_conflict" };
      if (isUniqueViolationOn(err, "idempotencyKey")) return { kind: "duplicate_request" };
      if (isUniqueViolationOn(err, "reference")) continue; // vanishingly rare; draw a new reference
      throw err;
    }
  }
  throw new Error("Could not allocate a unique booking reference");
}

async function replayExisting(
  deps: BookingDeps,
  actor: Actor,
  input: Reservation["input"],
): Promise<ServiceResult<CreatedBooking> | null> {
  const existing = await deps.db.booking.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: {
      id: true,
      reference: true,
      customerId: true,
      startAt: true,
      mode: true,
      workoutCategory: true,
      totalAmount: true,
      trainer: { select: { user: { select: { name: true } } } },
    },
  });
  if (!existing) return null;
  const same =
    existing.customerId === actor.userId &&
    existing.startAt.getTime() === input.startAt.getTime() &&
    existing.mode === input.mode &&
    existing.workoutCategory === input.workoutCategory;
  if (!same) {
    return fail("CONFLICT", "This booking request was already used. Refresh the page and try again.");
  }
  return ok({
    id: existing.id,
    reference: existing.reference,
    startAt: existing.startAt.toISOString(),
    trainerName: existing.trainer?.user.name ?? null,
    totalAmount: existing.totalAmount.toString(),
    replayed: true,
  });
}

/**
 * Create a booking for the acting customer. Validates the request, recalculates the price from the
 * active rules, re-checks availability and reserves the slot atomically. Never reports success
 * unless the booking row was committed.
 */
export async function createBooking(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<CreatedBooking>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can book sessions.");

  const parsed = createBookingInputSchema(deps.now).safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Some booking details need another look.", {
      fieldErrors: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  const customer = await loadCustomerContext(deps.db, actor.userId);
  if (!customer) return fail("NOT_FOUND", "We couldn't find an active customer profile for this account.");

  const replay = await replayExisting(deps, actor, input);
  if (replay) return replay;

  const now = deps.now();
  const startAt = input.startAt;
  const endAt = sessionEnd(startAt);
  const tz = customer.timeZone;
  const { from, to } = dayRange(startAt, tz);
  const [pricing, pool, customerBookings] = await Promise.all([
    loadActivePricing(deps.db, now),
    loadCandidatePool(deps.db, {
      serviceZoneId: customer.serviceZoneId,
      category: input.workoutCategory,
      from,
      to,
    }),
    loadCustomerBookings(deps.db, customer.userId, from, to),
  ]);

  const quote = quoteSession(pricing, startAt, tz);
  if (input.expectedTotal && input.expectedTotal !== quote.totalAmount) {
    return fail("PRICE_CHANGED", "The price for this slot changed. Check the new total and confirm again.", {
      quote,
    });
  }

  const alternatives = () => findAlternatives(deps, customer, input.workoutCategory, startAt);
  if (hasActiveOverlap(customerBookings, startAt, endAt)) {
    return fail("CONFLICT", "You already have a session that overlaps this time.", {
      alternatives: await alternatives(),
    });
  }

  const criteria = { category: input.workoutCategory, startAt, timeZone: tz };
  let order: { trainerId: string; name: string }[];
  if (input.preferredTrainerId) {
    const chosen = pool.candidates.find((c) => c.trainerId === input.preferredTrainerId);
    const reason = chosen ? ineligibility(chosen, criteria) : "CATEGORY";
    if (!chosen || reason) {
      return fail(
        reason === "BOOKED" ? "SLOT_TAKEN" : "NO_TRAINER",
        chosen && reason
          ? INELIGIBLE_MESSAGE[reason]
          : "That trainer can't take this session. Choose another trainer or time.",
        { alternatives: await alternatives() },
      );
    }
    order = [chosen];
  } else {
    order = rankTrainers(pool.candidates, criteria).slice(0, MAX_ASSIGNMENT_ATTEMPTS);
    if (order.length === 0) {
      return fail(
        "NO_TRAINER",
        `No trainer is free for ${categoryLabel(input.workoutCategory).toLowerCase()} at ${formatSlot(startAt, tz)}.`,
        { alternatives: await alternatives() },
      );
    }
  }

  for (const t of order) {
    const outcome = await reserve(deps, {
      trainerId: t.trainerId,
      trainerName: t.name,
      customer,
      startAt,
      endAt,
      quote,
      input,
    });
    switch (outcome.kind) {
      case "created":
        return ok({
          id: outcome.booking.id,
          reference: outcome.booking.reference,
          startAt: startAt.toISOString(),
          trainerName: t.name,
          totalAmount: quote.totalAmount,
          replayed: false,
        });
      case "duplicate_request":
        return (
          (await replayExisting(deps, actor, input)) ??
          fail("CONFLICT", "This booking request was already used. Refresh the page and try again.")
        );
      case "customer_conflict": {
        // A concurrent retry of this same request (same idempotency key) can land here: the copy that
        // won the lock already holds the slot. Replay it instead of reporting a clash with itself.
        const replayed = await replayExisting(deps, actor, input);
        if (replayed) return replayed;
        return fail("CONFLICT", "You already have a session that overlaps this time.", {
          alternatives: await alternatives(),
        });
      }
      case "trainer_unavailable":
        continue; // someone else took this trainer first: try the next-ranked one
    }
  }

  return fail(
    "SLOT_TAKEN",
    input.preferredTrainerId
      ? "Someone just booked this trainer for that time. Pick another trainer or time."
      : "That slot was just taken. Pick another time.",
    { alternatives: await alternatives() },
  );
}

// ─── Reading and cancelling ───────────────────────────────────────────────

/** Bookings an actor may see: their own (customer), assigned to them (trainer), or all (operations). */
function ownershipFilter(actor: Actor): { customerId?: string; trainerId?: string } | null {
  if (actor.role === "CUSTOMER") return { customerId: actor.userId };
  if (actor.role === "TRAINER") return { trainerId: actor.userId };
  return {};
}

export async function getBookingForActor(deps: BookingDeps, actor: Actor, bookingId: string) {
  const scope = ownershipFilter(actor);
  if (!scope || typeof bookingId !== "string" || bookingId.length > 40) return null;
  return deps.db.booking.findFirst({
    where: { id: bookingId, ...scope },
    include: {
      trainer: {
        select: {
          userId: true,
          specializations: true,
          experienceYears: true,
          user: { select: { name: true } },
        },
      },
      customer: { select: { addressLine: true, user: { select: { name: true } } } },
      serviceZone: { select: { name: true, timezone: true } },
      pricingRule: { select: { name: true, kind: true } },
      cancelledBy: { select: { id: true, name: true, role: true } },
    },
  });
}

export type CancelledBooking = { id: string; reference: string };

/**
 * Cancel a booking the actor is allowed to touch. Customers cancel their own bookings, trainers the
 * sessions assigned to them (with a reason for the customer), operations any booking. Someone
 * else's booking is reported as not found, so its existence isn't revealed.
 */
export async function cancelBooking(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<CancelledBooking>> {
  const parsed = cancelBookingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Check the cancellation details.", { fieldErrors: fieldErrors(parsed.error) });
  }
  const { bookingId, reason } = parsed.data;
  const scope = ownershipFilter(actor);
  const booking =
    scope &&
    (await deps.db.booking.findFirst({
      where: { id: bookingId, ...scope },
      select: {
        id: true,
        reference: true,
        status: true,
        startAt: true,
        customerId: true,
        trainerId: true,
        workoutCategory: true,
        customer: { select: { user: { select: { name: true } } } },
        trainer: { select: { user: { select: { name: true } } } },
        serviceZone: { select: { timezone: true } },
      },
    }));
  if (!booking) return fail("NOT_FOUND", "We couldn't find that booking.");

  if (actor.role === "TRAINER" && !reason) {
    return fail("VALIDATION", "Tell the customer why you're cancelling.", {
      fieldErrors: { reason: ["Add a short reason for the customer"] },
    });
  }

  const now = deps.now();
  const blocker = cancellationBlocker(booking, now);
  if (blocker) return fail("CONFLICT", blocker);

  const cancelled = await deps.db.$transaction(async (tx) => {
    // Conditional update: only one concurrent cancel (or a session start) can win this row.
    const res = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: [...CANCELLABLE_STATUSES] }, startAt: { gt: now } },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: actor.userId,
        cancellationReason: reason ?? null,
      },
    });
    if (res.count === 0) return false;

    const when = formatSlot(booking.startAt, booking.serviceZone.timezone);
    const by =
      actor.role === "CUSTOMER"
        ? booking.customer.user.name
        : actor.role === "TRAINER"
          ? "Your trainer"
          : "Zuryo operations";
    const recipients = [booking.customerId, booking.trainerId].filter(
      (id): id is string => !!id && id !== actor.userId,
    );
    if (recipients.length > 0) {
      await tx.notification.createMany({
        data: recipients.map((recipientId) => ({
          recipientId,
          bookingId: booking.id,
          type: "BOOKING_CANCELLED" as const,
          title: `Booking ${booking.reference} cancelled`,
          message: `${by} cancelled ${categoryLabel(booking.workoutCategory).toLowerCase()} on ${when}.${reason ? ` Reason: ${reason}` : ""}`,
        })),
      });
    }
    return true;
  }, deps.tx);

  if (!cancelled) {
    const fresh = await deps.db.booking.findUnique({
      where: { id: booking.id },
      select: { status: true, startAt: true },
    });
    return fail(
      "CONFLICT",
      (fresh && cancellationBlocker(fresh, now)) ?? "This booking just changed. Refresh and try again.",
    );
  }
  return ok({ id: booking.id, reference: booking.reference });
}
