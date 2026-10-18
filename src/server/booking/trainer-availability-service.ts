import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ACTIVE_BOOKING_STATUSES, MAX_ADVANCE_DAYS } from "@/lib/booking/rules";
import { addMinutes, zonedDayStart } from "@/lib/booking/time";
import { formatSlot, formatTime } from "@/lib/utils/format";
import { availabilityInputSchema, removeAvailabilityInputSchema } from "@/lib/validation/booking";
import type { Actor } from "@/server/auth/actor";
import type { BookingDeps } from "./deps";
import { fail, ok, type ServiceResult } from "./errors";

/**
 * Trainers open (AVAILABLE) or block (BLOCKED) time on a local day. Both operations take the same
 * trainer row lock as booking creation, so an edit and a booking for that trainer can't interleave:
 * a booking can't land in time that is being removed, and time can't be blocked over a booking that
 * is being written.
 */
async function lockTrainer(tx: Prisma.TransactionClient, trainerId: string) {
  await tx.$queryRaw`SELECT 1 FROM "TrainerProfile" WHERE "userId" = ${trainerId} FOR UPDATE`;
}

export async function addAvailability(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ id: string }>> {
  if (actor.role !== "TRAINER") return fail("FORBIDDEN", "Only trainers manage their availability.");
  const parsed = availabilityInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Check the time you entered.", {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    });
  }
  const input = parsed.data;
  const trainer = await deps.db.trainerProfile.findUnique({
    where: { userId: actor.userId },
    select: { userId: true, serviceZone: { select: { timezone: true } } },
  });
  if (!trainer) return fail("NOT_FOUND", "We couldn't find your trainer profile.");

  const tz = trainer.serviceZone.timezone;
  const midnight = zonedDayStart(input.date, tz);
  const startAt = addMinutes(midnight, input.startMinute);
  const endAt = addMinutes(midnight, input.endMinute);
  const now = deps.now();
  if (endAt <= now)
    return fail("VALIDATION", "That time has already passed.", {
      fieldErrors: { endMinute: ["That time has already passed"] },
    });
  if (startAt > addMinutes(now, MAX_ADVANCE_DAYS * 24 * 60)) {
    return fail("VALIDATION", `Add availability at most ${MAX_ADVANCE_DAYS} days ahead.`, {
      fieldErrors: { date: [`At most ${MAX_ADVANCE_DAYS} days ahead`] },
    });
  }

  return deps.db.$transaction(async (tx) => {
    await lockTrainer(tx, actor.userId);
    const sameKind = await tx.trainerAvailability.findFirst({
      where: {
        trainerId: actor.userId,
        status: input.status,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { startAt: true, endAt: true },
    });
    if (sameKind) {
      return fail<{ id: string }>(
        "CONFLICT",
        `This overlaps time you've already ${input.status === "AVAILABLE" ? "opened" : "blocked"} (${formatTime(sameKind.startAt, tz)}–${formatTime(sameKind.endAt, tz)}).`,
      );
    }
    if (input.status === "BLOCKED") {
      const clash = await tx.booking.findFirst({
        where: {
          trainerId: actor.userId,
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        orderBy: { startAt: "asc" },
        select: { startAt: true, customer: { select: { user: { select: { name: true } } } } },
      });
      if (clash) {
        return fail<{ id: string }>(
          "CONFLICT",
          `You have a session with ${clash.customer.user.name} at ${formatSlot(clash.startAt, tz)}. Cancel it before blocking this time.`,
        );
      }
    }
    const created = await tx.trainerAvailability.create({
      data: { trainerId: actor.userId, startAt, endAt, status: input.status, note: input.note ?? null },
      select: { id: true },
    });
    return ok(created);
  }, deps.tx);
}

export async function removeAvailability(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ id: string }>> {
  if (actor.role !== "TRAINER") return fail("FORBIDDEN", "Only trainers manage their availability.");
  const parsed = removeAvailabilityInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a time window to remove.");

  return deps.db.$transaction(async (tx) => {
    await lockTrainer(tx, actor.userId);
    const window = await tx.trainerAvailability.findFirst({
      where: { id: parsed.data.availabilityId, trainerId: actor.userId },
    });
    if (!window) return fail<{ id: string }>("NOT_FOUND", "We couldn't find that time window.");
    if (window.endAt <= deps.now()) {
      return fail<{ id: string }>("CONFLICT", "Past availability is kept as history and can't be removed.");
    }
    if (window.status === "AVAILABLE") {
      const booked = await tx.booking.count({
        where: {
          trainerId: actor.userId,
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
          startAt: { lt: window.endAt },
          endAt: { gt: window.startAt },
        },
      });
      if (booked > 0) {
        return fail<{ id: string }>(
          "CONFLICT",
          `${booked} booked session${booked === 1 ? " falls" : "s fall"} inside this time. Cancel ${booked === 1 ? "it" : "them"} first.`,
        );
      }
    }
    await tx.trainerAvailability.delete({ where: { id: window.id } });
    return ok({ id: window.id });
  }, deps.tx);
}
