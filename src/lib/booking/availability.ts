import type { AvailabilityStatus, BookingStatus } from "@/lib/validation/enums";
import {
  INSTANT_CONFIRM_MIN_LEAD_MINUTES,
  INSTANT_MIN_LEAD_MINUTES,
  INSTANT_WINDOW_MINUTES,
  MAX_ADVANCE_DAYS,
  SCHEDULED_MIN_LEAD_MINUTES,
  SERVICE_DAY,
  SESSION_MINUTES,
  SLOT_INTERVAL_MINUTES,
  isActiveStatus,
} from "./rules";
import { addMinutes, ceilToSlot, isOnSlotGrid, overlaps, zonedDayStart } from "./time";

/**
 * Pure availability rules. The server loads windows and bookings from Postgres and passes them in;
 * nothing here touches the database, so every rule is unit-tested directly.
 */
export type Interval = { startAt: Date; endAt: Date };
export type AvailabilityWindowLike = Interval & { status: AvailabilityStatus };
export type BookingIntervalLike = Interval & { status: BookingStatus };

export type TrainerSchedule = {
  windows: AvailabilityWindowLike[];
  bookings: BookingIntervalLike[];
};

export type BusyReason = "NO_AVAILABILITY" | "BLOCKED" | "BOOKED";
export type FreeCheck = { free: true } | { free: false; reason: BusyReason };

/** Sorts and merges overlapping or touching intervals (06:00–12:00 + 12:00–14:00 → 06:00–14:00). */
export function mergeIntervals<T extends Interval>(intervals: T[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const merged: Interval[] = [];
  for (const i of sorted) {
    const last = merged.at(-1);
    if (last && i.startAt <= last.endAt) {
      if (i.endAt > last.endAt) last.endAt = i.endAt;
    } else {
      merged.push({ startAt: i.startAt, endAt: i.endAt });
    }
  }
  return merged;
}

/**
 * Can this trainer take a session over [startAt, endAt)? The whole session must sit inside AVAILABLE
 * time, must not touch BLOCKED time, and must not overlap any active booking. Cancelled, completed
 * and failed bookings never block a slot.
 */
export function checkTrainerFree(schedule: TrainerSchedule, startAt: Date, endAt: Date): FreeCheck {
  const available = mergeIntervals(schedule.windows.filter((w) => w.status === "AVAILABLE"));
  if (!available.some((w) => w.startAt <= startAt && endAt <= w.endAt)) {
    return { free: false, reason: "NO_AVAILABILITY" };
  }
  if (schedule.windows.some((w) => w.status === "BLOCKED" && overlaps(w.startAt, w.endAt, startAt, endAt))) {
    return { free: false, reason: "BLOCKED" };
  }
  if (
    schedule.bookings.some((b) => isActiveStatus(b.status) && overlaps(b.startAt, b.endAt, startAt, endAt))
  ) {
    return { free: false, reason: "BOOKED" };
  }
  return { free: true };
}

/** Does any active booking in the list overlap [startAt, endAt)? Used for the customer's own diary. */
export function hasActiveOverlap(bookings: BookingIntervalLike[], startAt: Date, endAt: Date): boolean {
  return bookings.some((b) => isActiveStatus(b.status) && overlaps(b.startAt, b.endAt, startAt, endAt));
}

export function sessionEnd(startAt: Date): Date {
  return addMinutes(startAt, SESSION_MINUTES);
}

/** Every slot start on the local service-day grid for `dateKey` (06:00, 06:30 … 20:00). */
export function serviceDayStarts(dateKey: string, timeZone: string): Date[] {
  const midnight = zonedDayStart(dateKey, timeZone);
  const starts: Date[] = [];
  for (
    let minute = SERVICE_DAY.startMinute;
    minute + SESSION_MINUTES <= SERVICE_DAY.endMinute;
    minute += SLOT_INTERVAL_MINUTES
  ) {
    starts.push(addMinutes(midnight, minute));
  }
  return starts;
}

/** Candidate instant starts: grid points from now + 15 min up to now + 60 min, earliest first. */
export function instantCandidateStarts(now: Date): Date[] {
  const earliest = ceilToSlot(addMinutes(now, INSTANT_MIN_LEAD_MINUTES));
  const latest = addMinutes(now, INSTANT_WINDOW_MINUTES);
  const starts: Date[] = [];
  for (let s = earliest; s <= latest; s = addMinutes(s, SLOT_INTERVAL_MINUTES)) starts.push(s);
  return starts;
}

/**
 * Why a start time can't be used for this mode, or null when it can. The single source of truth
 * for timing rules: the Zod schema and the booking services both call it.
 */
export function startTimeProblem(mode: "INSTANT" | "SCHEDULED", startAt: Date, now: Date): string | null {
  if (Number.isNaN(startAt.getTime())) return "Choose a time";
  if (!isOnSlotGrid(startAt)) return "Slots start on the hour or half hour";
  if (startAt <= now) return "That time has already passed";
  if (mode === "INSTANT") {
    const earliest = addMinutes(now, INSTANT_CONFIRM_MIN_LEAD_MINUTES);
    const latest = addMinutes(now, INSTANT_WINDOW_MINUTES);
    return startAt < earliest || startAt > latest
      ? "That instant slot is no longer within the next hour. Find a new instant slot."
      : null;
  }
  switch (scheduledTiming(startAt, now)) {
    case "INSTANT_WINDOW":
      return "Scheduled sessions start more than 60 minutes from now. Use Instant for sooner.";
    case "TOO_FAR":
      return `Book at most ${MAX_ADVANCE_DAYS} days ahead`;
    default:
      return null;
  }
}

export type ScheduledTiming = "PAST" | "INSTANT_WINDOW" | "TOO_FAR" | "OK";

/** Where a start time falls for a scheduled booking, relative to `now`. */
export function scheduledTiming(startAt: Date, now: Date): ScheduledTiming {
  if (startAt <= now) return "PAST";
  if (startAt <= addMinutes(now, SCHEDULED_MIN_LEAD_MINUTES)) return "INSTANT_WINDOW";
  if (startAt > addMinutes(now, MAX_ADVANCE_DAYS * 24 * 60)) return "TOO_FAR";
  return "OK";
}
