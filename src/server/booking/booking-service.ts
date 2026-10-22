import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { checkTrainerFree, hasActiveOverlap, sessionEnd } from "@/lib/booking/availability";
import { cancellationBlocker } from "@/lib/booking/cancellation";
import { categoryLabel } from "@/lib/booking/categories";
import { INELIGIBLE_MESSAGE, ineligibility, rankTrainers } from "@/lib/booking/matching";
import { quoteSession, type PriceQuote } from "@/lib/booking/pricing";
import {
  ACTIVE_BOOKING_STATUSES,
  CANCELLABLE_STATUSES,
  INSTANT_CONFIRM_MIN_LEAD_MINUTES,
  INSTANT_MIN_LEAD_MINUTES,
} from "@/lib/booking/rules";
import { addMinutes } from "@/lib/booking/time";
import {
  REDEMPTION_MESSAGE,
  cancellationRestoresSession,
  redemptionBlocker,
  type RedemptionBlocker,
} from "@/lib/packages/packages";
import { formatINR } from "@/lib/pricing";
import { formatSlot } from "@/lib/utils/format";
import { cancelBookingInputSchema, createBookingInputSchema } from "@/lib/validation/booking";
import type { Actor } from "@/server/auth/actor";
import { notify, type NewNotification } from "@/server/notifications/notification-service";
import {
  checkRedemption,
  lockPackage,
  recordRedemption,
  restoreRedemption,
} from "@/server/packages/package-service";
import { withTrip } from "@/server/location/trip";
import { runSimulatedPayment } from "@/server/payments/simulated-provider";
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
  /** How the session is paid for: one package session, or a (simulated) payment of totalAmount. */
  coverage: "PACKAGE" | "PAYMENT";
  /** Sessions left in the package after this booking, when coverage is PACKAGE. */
  packageSessionsLeft: number | null;
  /** True when this was a retry of a request that had already created the booking. */
  replayed: boolean;
};

const DECLINED_MESSAGE =
  "The simulated payment was declined, so nothing was booked and the slot wasn't held. Try again or choose another way to pay.";

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
  | { kind: "created"; booking: { id: string; reference: string }; packageSessionsLeft: number | null }
  | { kind: "payment_declined" }
  | { kind: "package_unavailable"; blocker: RedemptionBlocker }
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
 *  3. Payment happens in the same transaction. A package session: the package row is locked too,
 *     re-checked (owner, paid, unexpired, sessions left) and debited through the append-only ledger.
 *     A simulated payment: the provider's answer is recorded; a decline turns the booking into FAILED,
 *     which holds no slot (it is outside the overlap constraints' predicate).
 *  4. The booking, payment or ledger row and the notifications commit together, or not at all.
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

        const now = deps.now();
        const payment = r.input.payment;
        const pkg = payment.method === "PACKAGE" ? await lockPackage(tx, payment.packageId) : null;
        if (payment.method === "PACKAGE") {
          const blocker = checkRedemption(pkg, { customerId: r.customer.userId, startAt: r.startAt, now });
          if (blocker) return { kind: "package_unavailable", blocker };
        }
        const charge = payment.method === "SIMULATED_PAYMENT" ? runSimulatedPayment(payment.outcome) : null;
        const declined = charge?.status === "FAILED";

        const reference = newReference();
        const booking = await tx.booking.create({
          data: {
            reference,
            customerId: r.customer.userId,
            trainerId: r.trainerId,
            preferredTrainerId: r.input.preferredTrainerId ?? null,
            serviceZoneId: r.customer.serviceZoneId,
            packageId: pkg?.id ?? null,
            mode: r.input.mode,
            status: declined ? "FAILED" : "CONFIRMED",
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
        let paymentId: string | null = null;
        let packageSessionsLeft: number | null = null;
        if (pkg) {
          packageSessionsLeft = await recordRedemption(tx, pkg, booking.id);
        } else if (charge) {
          const row = await tx.payment.create({
            data: {
              bookingId: booking.id,
              amount: r.quote.totalAmount,
              baseAmount: r.quote.sessionPrice,
              commissionAmount: r.quote.commissionAmount,
              currency: r.quote.currency,
              status: charge.status,
              providerReference: charge.providerReference,
              failureReason: charge.failureReason,
              idempotencyKey: `booking:${r.input.idempotencyKey}`,
              completedAt: now,
            },
            select: { id: true },
          });
          paymentId = row.id;
        }

        if (declined) {
          await notify(tx, [
            {
              recipientId: r.customer.userId,
              bookingId: booking.id,
              paymentId,
              type: "PAYMENT_FAILED",
              title: "Payment declined (demo)",
              message: `The simulated payment of ${formatINR(r.quote.totalAmount)} for ${what} on ${when} was declined. Nothing was booked.`,
              dedupeKey: `payment-failed:${paymentId}`,
            },
          ]);
          return { kind: "payment_declined" };
        }

        const customerNote: NewNotification = pkg
          ? {
              recipientId: r.customer.userId,
              bookingId: booking.id,
              packageId: pkg.id,
              type: "PACKAGE_SESSION_REDEEMED",
              title: `Booked with ${r.trainerName}, using ${pkg.name}`,
              message: `${what} on ${when}. 1 session used, ${packageSessionsLeft} left. Booking ${booking.reference}.`,
            }
          : {
              recipientId: r.customer.userId,
              bookingId: booking.id,
              paymentId,
              type: "PAYMENT_SUCCEEDED",
              title: `${r.trainerName} is your trainer`,
              message: `${what} on ${when}. Paid ${formatINR(r.quote.totalAmount)} (simulated). Booking ${booking.reference}.`,
            };
        await notify(tx, [
          {
            recipientId: r.trainerId,
            bookingId: booking.id,
            type: "BOOKING_ASSIGNED",
            title: `New session with ${r.customer.name}`,
            message: `${what} · ${when} · ${r.customer.zoneName}`,
          },
          customerNote,
        ]);
        return { kind: "created", booking, packageSessionsLeft };
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
      status: true,
      packageId: true,
      workoutCategory: true,
      totalAmount: true,
      trainer: { select: { user: { select: { name: true } } } },
      package: { select: { totalSessions: true, usedSessions: true } },
    },
  });
  if (!existing) return null;
  const same =
    existing.customerId === actor.userId &&
    existing.startAt.getTime() === input.startAt.getTime() &&
    existing.mode === input.mode &&
    existing.workoutCategory === input.workoutCategory &&
    existing.packageId === (input.payment.method === "PACKAGE" ? input.payment.packageId : null);
  if (!same) {
    return fail("CONFLICT", "This booking request was already used. Refresh the page and try again.");
  }
  // The first attempt's payment was declined: report that again rather than inventing a new outcome.
  if (existing.status === "FAILED") return fail("PAYMENT_FAILED", DECLINED_MESSAGE);
  return ok({
    id: existing.id,
    reference: existing.reference,
    startAt: existing.startAt.toISOString(),
    trainerName: existing.trainer?.user.name ?? null,
    totalAmount: existing.totalAmount.toString(),
    coverage: existing.packageId ? "PACKAGE" : "PAYMENT",
    packageSessionsLeft: existing.package ? existing.package.totalSessions - existing.package.usedSessions : null,
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
      destination: customer.location,
    }),
    loadCustomerBookings(deps.db, customer.userId, from, to),
  ]);

  const quote = quoteSession(pricing, startAt, tz);
  if (input.expectedTotal && input.expectedTotal !== quote.totalAmount) {
    return fail("PRICE_CHANGED", "The price for this slot changed. Check the new total and confirm again.", {
      quote,
    });
  }

  // Early, friendly package check (re-done under the package row lock inside the transaction).
  if (input.payment.method === "PACKAGE") {
    const pkg = await deps.db.package.findFirst({
      where: { id: input.payment.packageId, customerId: actor.userId },
      select: { customerId: true, status: true, totalSessions: true, usedSessions: true, expiresAt: true },
    });
    const blocker = pkg ? redemptionBlocker(pkg, { customerId: actor.userId, startAt, now }) : "NOT_OWNER";
    if (blocker) return fail("PACKAGE_UNAVAILABLE", REDEMPTION_MESSAGE[blocker]);
  }

  const alternatives = () => findAlternatives(deps, customer, input.workoutCategory, startAt);
  if (hasActiveOverlap(customerBookings, startAt, endAt)) {
    return fail("CONFLICT", "You already have a session that overlaps this time.", {
      alternatives: await alternatives(),
    });
  }

  // Reach is judged as if the trainer set out when the offer was made: an instant start is accepted
  // down to INSTANT_CONFIRM_MIN_LEAD_MINUTES for time spent reviewing, and travel gets the same
  // allowance, so a review screen left open a few minutes doesn't turn a valid offer into a refusal.
  const departFrom =
    input.mode === "INSTANT"
      ? addMinutes(now, -(INSTANT_MIN_LEAD_MINUTES - INSTANT_CONFIRM_MIN_LEAD_MINUTES))
      : now;
  const criteria = { category: input.workoutCategory, startAt, timeZone: tz, departFrom };
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
          coverage: input.payment.method === "PACKAGE" ? "PACKAGE" : "PAYMENT",
          packageSessionsLeft: outcome.packageSessionsLeft,
          replayed: false,
        });
      case "payment_declined":
        return fail("PAYMENT_FAILED", DECLINED_MESSAGE);
      case "package_unavailable":
        return fail("PACKAGE_UNAVAILABLE", REDEMPTION_MESSAGE[outcome.blocker]);
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
  const row = await deps.db.booking.findFirst({
    where: { id: bookingId, ...scope },
    include: {
      trainer: {
        select: {
          userId: true,
          specializations: true,
          experienceYears: true,
          baseLatitude: true,
          baseLongitude: true,
          user: { select: { name: true } },
        },
      },
      customer: { select: { addressLine: true, user: { select: { name: true } } } },
      serviceZone: { select: { name: true, timezone: true, latitude: true, longitude: true } },
      pricingRule: { select: { name: true, kind: true } },
      cancelledBy: { select: { id: true, name: true, role: true } },
      package: { select: { id: true, name: true, totalSessions: true, usedSessions: true, expiresAt: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          amount: true,
          providerReference: true,
          failureReason: true,
          completedAt: true,
          refundedAt: true,
        },
      },
      packageEntries: { orderBy: { createdAt: "asc" }, select: { reason: true, delta: true, createdAt: true } },
      sessionRecord: {
        select: {
          startedAt: true,
          endsAt: true,
          plannedMinutes: true,
          warningSentAt: true,
          completedAt: true,
          completionSource: true,
          activities: true,
          trainerNotes: true,
          suggestedNextWorkout: true,
          customerFeedback: true,
        },
      },
    },
  });
  // The trip is derived here so the trainer's coordinates never reach a page.
  return row ? withTrip(row) : null;
}

export type CancelledBooking = {
  id: string;
  reference: string;
  /** A package session was given back (package-covered bookings). */
  restoredSession: boolean;
  /** Amount of the simulated payment marked refunded (pay-per-session bookings). */
  refundedAmount: string | null;
};

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
        packageId: true,
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
    if (res.count === 0) return null;

    // Give back what the booking used, at most once (unique ledger row / conditional payment update).
    const restored =
      booking.packageId && cancellationRestoresSession()
        ? await restoreRedemption(tx, booking.packageId, booking.id, now)
        : null;
    const refundedPayment = booking.packageId
      ? null
      : await tx.payment.findFirst({
          where: { bookingId: booking.id, status: "SUCCEEDED" },
          select: { id: true, amount: true },
        });
    if (refundedPayment) {
      await tx.payment.updateMany({
        where: { id: refundedPayment.id, status: "SUCCEEDED" },
        data: { status: "REFUNDED", refundedAt: now },
      });
    }

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
    const refundNote = refundedPayment
      ? ` Your simulated payment of ${formatINR(refundedPayment.amount)} was refunded.`
      : "";
    await notify(tx, [
      ...recipients.map((recipientId) => ({
        recipientId,
        bookingId: booking.id,
        type: "BOOKING_CANCELLED" as const,
        title: `Booking ${booking.reference} cancelled`,
        message: `${by} cancelled ${categoryLabel(booking.workoutCategory).toLowerCase()} on ${when}.${reason ? ` Reason: ${reason}` : ""}${recipientId === booking.customerId ? refundNote : ""}`,
      })),
      ...(restored?.restored
        ? [
            {
              recipientId: booking.customerId,
              bookingId: booking.id,
              packageId: booking.packageId,
              type: "PACKAGE_SESSION_RESTORED" as const,
              title: `Session returned to ${restored.name}`,
              message: `Booking ${booking.reference} was cancelled, so its session is back in your package (${restored.remaining} left).`,
              dedupeKey: `package-restored:${booking.id}`,
            },
          ]
        : []),
    ]);
    return {
      restoredSession: restored?.restored ?? false,
      refundedAmount: refundedPayment ? refundedPayment.amount.toString() : null,
    };
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
  return ok({ id: booking.id, reference: booking.reference, ...cancelled });
}
