import {
  SESSION_START_EARLY_MINUTES,
  SESSION_START_LATE_MINUTES,
  SESSION_WARNING_BEFORE_END_MINUTES,
} from "@/lib/booking/rules";
import { addMinutes } from "@/lib/booking/time";
import type { BookingStatus } from "@/lib/validation/enums";

/**
 * Pure session-lifecycle rules. Timing always comes from the persisted SessionRecord (startedAt,
 * endsAt, plannedMinutes), never from a browser timer, so a refresh or a closed tab can't change it.
 *
 *   CONFIRMED ──start──▶ IN_PROGRESS ──(trainer ends from 55 min, or the 60-minute deadline)──▶ COMPLETED
 *   CONFIRMED ──cancel (before the scheduled start)──▶ CANCELLED
 */
export type SessionClock = {
  startedAt: Date;
  endsAt: Date;
  plannedMinutes: number;
  warningSentAt: Date | null;
  completedAt: Date | null;
};

export function warningAt(s: Pick<SessionClock, "endsAt">): Date {
  return addMinutes(s.endsAt, -SESSION_WARNING_BEFORE_END_MINUTES);
}

/** RUNNING before the warning, WRAP_UP from the warning to the deadline, DUE once the deadline passed. */
export type SessionPhase = "RUNNING" | "WRAP_UP" | "DUE" | "COMPLETED";

export function sessionPhase(s: SessionClock, now: Date): SessionPhase {
  if (s.completedAt) return "COMPLETED";
  if (now >= s.endsAt) return "DUE";
  if (now >= warningAt(s)) return "WRAP_UP";
  return "RUNNING";
}

export function remainingMs(s: Pick<SessionClock, "endsAt">, now: Date): number {
  return Math.max(0, s.endsAt.getTime() - now.getTime());
}

/** The window in which the assigned trainer may start a confirmed session. */
export function startWindow(scheduledStart: Date): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: addMinutes(scheduledStart, -SESSION_START_EARLY_MINUTES),
    closesAt: addMinutes(scheduledStart, SESSION_START_LATE_MINUTES),
  };
}

/** Why the session can't be started now, or null when it can. */
export function startBlocker(b: { status: BookingStatus; startAt: Date }, now: Date): string | null {
  switch (b.status) {
    case "CONFIRMED":
      break;
    case "IN_PROGRESS":
      return "This session has already started.";
    case "COMPLETED":
      return "This session is already completed.";
    case "CANCELLED":
      return "This booking was cancelled.";
    default:
      return "This booking can't be started.";
  }
  const { opensAt, closesAt } = startWindow(b.startAt);
  if (now < opensAt) return `You can start this session from ${SESSION_START_EARLY_MINUTES} minutes before it begins.`;
  if (now > closesAt) {
    return `The start window closed ${SESSION_START_LATE_MINUTES} minutes after the scheduled time. Ask operations to resolve this booking.`;
  }
  return null;
}

/** Why the trainer can't end the session now, or null when they can (from the 55-minute wrap-up on). */
export function completeBlocker(status: BookingStatus, s: SessionClock | null, now: Date): string | null {
  if (status === "COMPLETED") return "This session is already completed.";
  if (status !== "IN_PROGRESS" || !s) return "Only a session in progress can be completed.";
  if (now < warningAt(s)) {
    return `You can end the session from the ${s.plannedMinutes - SESSION_WARNING_BEFORE_END_MINUTES}-minute mark.`;
  }
  return null;
}

/**
 * What the server should do for an in-progress session at `now`. The warning is only worth sending
 * while the session is still running: once the deadline has passed, completion supersedes it.
 */
export function reconcileDecision(
  status: BookingStatus,
  s: SessionClock | null,
  now: Date,
): { sendWarning: boolean; complete: boolean } {
  if (status !== "IN_PROGRESS" || !s || s.completedAt) return { sendWarning: false, complete: false };
  const complete = now >= s.endsAt;
  return { complete, sendWarning: !complete && !s.warningSentAt && now >= warningAt(s) };
}

/** Completion recorded for a session: the trainer's end time, or the deadline itself when it lapsed. */
export function completionFor(s: SessionClock, now: Date): { completedAt: Date; source: "TRAINER" | "DEADLINE" } {
  return now >= s.endsAt ? { completedAt: s.endsAt, source: "DEADLINE" } : { completedAt: now, source: "TRAINER" };
}
