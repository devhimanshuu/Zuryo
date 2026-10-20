import type { BookingStatus } from "@/lib/validation/enums";
import { MAX_RESCHEDULES } from "./rules";

/**
 * Rescheduling rules. A confirmed booking can be moved to another scheduled slot before it starts,
 * up to MAX_RESCHEDULES times. The move keeps the same booking (reference, payment or package
 * session), so nothing is charged, refunded or redeemed twice:
 *  - package-covered bookings may move to any slot (one package session covers standard or peak);
 *  - pay-per-session bookings may only move to a slot with the same total, because the simulated
 *    payment already captured that amount. A different-priced time means cancel (full simulated
 *    refund) and book again.
 */
export const RESCHEDULE_POLICY_NOTE = `You can move this session to another time before it starts (up to ${MAX_RESCHEDULES} times). Pay-per-session bookings can move to times at the same price.`;

/** Why this booking can't be rescheduled right now, or null when it can. */
export function rescheduleBlocker(
  booking: { status: BookingStatus; startAt: Date; rescheduleCount: number; trainerId: string | null },
  now: Date,
): string | null {
  switch (booking.status) {
    case "CONFIRMED":
      break;
    case "CANCELLED":
      return "This booking is cancelled, so it can't be moved.";
    case "COMPLETED":
      return "Completed sessions can't be moved.";
    case "IN_PROGRESS":
      return "This session is in progress and can't be moved.";
    case "FAILED":
      return "This booking didn't go through, so there's nothing to move.";
    default:
      return "This booking can't be moved.";
  }
  if (!booking.trainerId) return "This booking has no trainer yet, so it can't be moved.";
  if (booking.startAt <= now) return "This session has already started, so it can't be moved.";
  if (booking.rescheduleCount >= MAX_RESCHEDULES) {
    return `This booking has already been moved ${MAX_RESCHEDULES} times. Cancel it and book a new session instead.`;
  }
  return null;
}

export type ReschedulePolicy = "ANY_SLOT" | "SAME_TOTAL";

/** Package sessions cover any slot; a paid booking can only move to a slot with the same total. */
export function reschedulePolicyFor(booking: { packageId: string | null }): ReschedulePolicy {
  return booking.packageId ? "ANY_SLOT" : "SAME_TOTAL";
}
