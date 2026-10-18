import type { BookingStatus } from "@/lib/validation/enums";

/**
 * No cancellation window or fee exists in the product requirements yet, so the only rule is the
 * obvious one: a confirmed (or legacy pending) booking can be cancelled any time before it starts.
 */
export const CANCELLATION_POLICY_NOTE =
  "You can cancel any time before the session starts. No cancellation fee applies yet.";

/** Why this booking can't be cancelled right now, or null when it can. */
export function cancellationBlocker(
  booking: { status: BookingStatus; startAt: Date },
  now: Date,
): string | null {
  switch (booking.status) {
    case "CANCELLED":
      return "This booking is already cancelled.";
    case "COMPLETED":
      return "Completed sessions can't be cancelled.";
    case "IN_PROGRESS":
      return "This session is in progress and can't be cancelled.";
    case "FAILED":
      return "This booking didn't go through, so there's nothing to cancel.";
    default:
      return booking.startAt <= now ? "This session has already started, so it can't be cancelled." : null;
  }
}
