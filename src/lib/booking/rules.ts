import type { BookingStatus } from "@/lib/validation/enums";

/**
 * Product rules for the booking engine, in one place. Server validation, slot generation and the
 * booking UI all read these constants; nothing else hard-codes the numbers.
 */

/** Every session is 60 minutes. */
export const SESSION_MINUTES = 60;
/** Sessions start on the hour or half hour. */
export const SLOT_INTERVAL_MINUTES = 30;

/** Instant sessions start within the next hour... */
export const INSTANT_WINDOW_MINUTES = 60;
/** ...but no sooner than this, so the trainer has time to reach the customer's tower. */
export const INSTANT_MIN_LEAD_MINUTES = 15;
/**
 * At confirmation an instant slot is still accepted down to this lead time, which covers the time a
 * customer spends on the review screen. The server re-checks availability either way.
 */
export const INSTANT_CONFIRM_MIN_LEAD_MINUTES = 5;

/** Scheduled sessions start after the instant window, so the two modes never overlap. */
export const SCHEDULED_MIN_LEAD_MINUTES = INSTANT_WINDOW_MINUTES;
export const MAX_ADVANCE_DAYS = 30;
/** Days shown in the scheduling date strip (bounded by MAX_ADVANCE_DAYS). */
export const BOOKING_HORIZON_DAYS = 14;

/**
 * Local service hours used to draw the slot grid (first start 06:00, last session ends 21:00).
 * This is display scaffolding only: whether a slot is bookable comes from trainer availability.
 */
export const SERVICE_DAY = { startMinute: 6 * 60, endMinute: 21 * 60 } as const;

/** Minutes before the end at which the "wrap up" warning goes out (55 minutes into a 60-minute session). */
export const SESSION_WARNING_BEFORE_END_MINUTES = 5;
/** A trainer may start a session from 15 minutes before its scheduled time... */
export const SESSION_START_EARLY_MINUTES = 15;
/** ...until 30 minutes after it. Later than that the booking needs operations' attention. */
export const SESSION_START_LATE_MINUTES = 30;

/** A booking can be moved to a new time at most this many times; after that, cancel and rebook. */
export const MAX_RESCHEDULES = 3;

export const NOTES_MAX_LENGTH = 500;
export const CANCELLATION_REASON_MAX_LENGTH = 280;

/**
 * Statuses that hold a trainer's (and customer's) time. This list must match the predicate of the
 * `Booking_trainer_no_overlap` / `Booking_customer_no_overlap` exclusion constraints.
 */
export const ACTIVE_BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
] as const satisfies readonly BookingStatus[];

/** Statuses a booking can be cancelled from (and only before it starts). */
export const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED"] as const satisfies readonly BookingStatus[];

export function isActiveStatus(status: BookingStatus): boolean {
  return (ACTIVE_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

export function isCancellableStatus(status: BookingStatus): boolean {
  return (CANCELLABLE_STATUSES as readonly BookingStatus[]).includes(status);
}
