import "server-only";
import { checkTrainerFree } from "@/lib/booking/availability";
import { categoryLabel } from "@/lib/booking/categories";
import { CANCELLABLE_STATUSES } from "@/lib/booking/rules";
import { formatSlot } from "@/lib/utils/format";
import type { WorkoutCategory } from "@/lib/validation/enums";
import { reassignBookingInputSchema } from "@/lib/validation/operations";
import type { Actor } from "@/server/auth/actor";
import { notify } from "@/server/notifications/notification-service";
import type { BookingDeps } from "./deps";
import { exclusionConstraint, fail, ok, type ServiceResult } from "./errors";

export type ReassignedBooking = {
  id: string;
  reference: string;
  trainerName: string;
  /** True when the booking already had this trainer (nothing changed). */
  unchanged: boolean;
};

/**
 * Move a booking to another trainer without touching its time, price or coverage. Only an OPERATIONS
 * actor can call this. The booking row and target trainer are locked in the same order booking
 * creation uses, then availability is re-read under the locks; the exclusion constraints back it up.
 */
export async function reassignBooking(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<ReassignedBooking>> {
  if (actor.role !== "OPERATIONS") return fail("FORBIDDEN", "Only operations can reassign a booking.");
  const parsed = reassignBookingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Choose a trainer.");
  }
  const { bookingId, trainerId, note } = parsed.data;

  try {
    return await deps.db.$transaction(async (tx): Promise<ServiceResult<ReassignedBooking>> => {
      const rows = await tx.$queryRaw<
        {
          id: string;
          reference: string;
          status: string;
          startAt: Date;
          endAt: Date;
          customerId: string;
          trainerId: string | null;
          serviceZoneId: string;
          workoutCategory: WorkoutCategory | null;
        }[]
      >`SELECT "id", "reference", "status", "startAt", "endAt", "customerId", "trainerId",
               "serviceZoneId", "workoutCategory"::text AS "workoutCategory"
        FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
      const booking = rows[0];
      if (!booking) return fail("NOT_FOUND", "We couldn't find that booking.");
      const now = deps.now();
      if (!(CANCELLABLE_STATUSES as readonly string[]).includes(booking.status)) {
        return fail("CONFLICT", "Only pending or confirmed bookings can be reassigned.");
      }
      if (booking.startAt.getTime() <= now.getTime()) {
        return fail("CONFLICT", "This session has already started.");
      }
      if (booking.trainerId === trainerId) {
        const existing = await tx.user.findUnique({ where: { id: trainerId }, select: { name: true } });
        return ok({
          id: booking.id,
          reference: booking.reference,
          trainerName: existing?.name ?? "the trainer",
          unchanged: true,
        });
      }
      if (!booking.workoutCategory) {
        return fail("CONFLICT", "This booking has no workout type, so it can't be reassigned.");
      }

      const locked = await tx.$queryRaw<
        { isActive: boolean; serviceZoneId: string; workoutCategories: string[] }[]
      >`SELECT "isActive", "serviceZoneId", "workoutCategories"::text[] AS "workoutCategories"
        FROM "TrainerProfile" WHERE "userId" = ${trainerId} FOR UPDATE`;
      const trainer = locked[0];
      if (
        !trainer?.isActive ||
        trainer.serviceZoneId !== booking.serviceZoneId ||
        !trainer.workoutCategories.includes(booking.workoutCategory)
      ) {
        return fail("NO_TRAINER", "That trainer can't take this session in the booking's community.");
      }

      const [windows, clashes, names] = await Promise.all([
        tx.trainerAvailability.findMany({
          where: { trainerId, startAt: { lt: booking.endAt }, endAt: { gt: booking.startAt } },
          select: { startAt: true, endAt: true, status: true },
        }),
        tx.booking.findMany({
          where: {
            id: { not: booking.id },
            status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
            startAt: { lt: booking.endAt },
            endAt: { gt: booking.startAt },
            trainerId,
          },
          select: { startAt: true, endAt: true, status: true },
        }),
        Promise.all([
          tx.user.findUnique({ where: { id: trainerId }, select: { name: true } }),
          tx.user.findUnique({ where: { id: booking.customerId }, select: { name: true } }),
          tx.serviceZone.findUnique({ where: { id: booking.serviceZoneId }, select: { timezone: true } }),
        ]),
      ]);
      const free = checkTrainerFree({ windows, bookings: clashes }, booking.startAt, booking.endAt);
      if (!free.free) return fail("SLOT_TAKEN", "That trainer is already booked for this time.");

      const [trainerUser, customerUser, zone] = names;
      await tx.booking.update({ where: { id: booking.id }, data: { trainerId } });

      const when = formatSlot(booking.startAt, zone?.timezone);
      const what = categoryLabel(booking.workoutCategory);
      const trainerName = trainerUser?.name ?? "your new trainer";
      const notes = [
        {
          recipientId: booking.customerId,
          bookingId: booking.id,
          type: "BOOKING_RESCHEDULED" as const,
          title: `Booking ${booking.reference} has a new trainer`,
          message: `${what} on ${when} is now with ${trainerName}.${note ? ` Note from ZuryoFit: ${note}` : ""}`,
        },
        {
          recipientId: trainerId,
          bookingId: booking.id,
          type: "BOOKING_ASSIGNED" as const,
          title: `New session with ${customerUser?.name ?? "a customer"}`,
          message: `${what} · ${when}${note ? ` · ${note}` : ""}`,
        },
      ];
      if (booking.trainerId) {
        notes.push({
          recipientId: booking.trainerId,
          bookingId: booking.id,
          type: "BOOKING_RESCHEDULED",
          title: `Booking ${booking.reference} moved off your schedule`,
          message: `${what} on ${when} is now covered by ${trainerName}. You're no longer booked for it.`,
        });
      }
      await notify(tx, notes);

      return ok({ id: booking.id, reference: booking.reference, trainerName, unchanged: false });
    }, deps.tx);
  } catch (err) {
    const constraint = exclusionConstraint(err);
    if (constraint === "Booking_trainer_no_overlap") {
      return fail("SLOT_TAKEN", "That trainer is already booked for this time.");
    }
    throw err;
  }
}
