import { describe, expect, it } from "vitest";
import {
  buzzerCue,
  completeBlocker,
  completionFor,
  reconcileDecision,
  remainingMs,
  sessionPhase,
  startBlocker,
  warningAt,
  type SessionClock,
} from "@/lib/sessions/lifecycle";

const T0 = new Date("2026-10-19T04:30:00Z"); // session started at 10:00 IST
const min = (m: number, s = 0) => new Date(T0.getTime() + m * 60_000 + s * 1000);
const session = (patch: Partial<SessionClock> = {}): SessionClock => ({
  startedAt: T0,
  endsAt: min(60),
  plannedMinutes: 60,
  warningSentAt: null,
  completedAt: null,
  ...patch,
});

describe("start window", () => {
  const confirmed = { status: "CONFIRMED" as const, startAt: T0 };

  it("opens 15 minutes before and closes 30 minutes after the scheduled start", () => {
    expect(startBlocker(confirmed, min(-15, -1))).toMatch(/15 minutes before/);
    expect(startBlocker(confirmed, min(-15))).toBeNull();
    expect(startBlocker(confirmed, T0)).toBeNull();
    expect(startBlocker(confirmed, min(30))).toBeNull();
    expect(startBlocker(confirmed, min(30, 1))).toMatch(/window closed/);
  });

  it.each([
    ["IN_PROGRESS", /already started/],
    ["COMPLETED", /already completed/],
    ["CANCELLED", /cancelled/],
    ["FAILED", /can't be started/],
  ] as const)("refuses to start a %s booking", (status, message) => {
    expect(startBlocker({ status, startAt: T0 }, T0)).toMatch(message);
  });
});

describe("timing from persisted timestamps", () => {
  it("puts the warning 5 minutes before the end", () => {
    expect(warningAt(session())).toEqual(min(55));
  });

  it("moves RUNNING → WRAP_UP at exactly 55:00 and → DUE at exactly 60:00", () => {
    expect(sessionPhase(session(), min(54, 59))).toBe("RUNNING");
    expect(sessionPhase(session(), min(55))).toBe("WRAP_UP");
    expect(sessionPhase(session(), min(59, 59))).toBe("WRAP_UP");
    expect(sessionPhase(session(), min(60))).toBe("DUE");
    expect(sessionPhase(session({ completedAt: min(58) }), min(70))).toBe("COMPLETED");
  });

  it("derives remaining time from the stored deadline, so re-reading never resets it", () => {
    const s = session();
    expect(remainingMs(s, min(20))).toBe(40 * 60_000);
    // A "refresh" is just another read of the same record at a later time.
    expect(remainingMs({ ...s }, min(45))).toBe(15 * 60_000);
    expect(remainingMs(s, min(90))).toBe(0);
  });
});

describe("reconciliation decisions", () => {
  it("does nothing before the warning point", () => {
    expect(reconcileDecision("IN_PROGRESS", session(), min(54, 59))).toEqual({ sendWarning: false, complete: false });
  });

  it("sends the warning from 55:00, and only while it hasn't been sent", () => {
    expect(reconcileDecision("IN_PROGRESS", session(), min(55))).toEqual({ sendWarning: true, complete: false });
    expect(reconcileDecision("IN_PROGRESS", session({ warningSentAt: min(55) }), min(57))).toEqual({
      sendWarning: false,
      complete: false,
    });
  });

  it("completes at 60:00 and skips a warning that is no longer relevant", () => {
    expect(reconcileDecision("IN_PROGRESS", session(), min(60))).toEqual({ sendWarning: false, complete: true });
    expect(reconcileDecision("IN_PROGRESS", session(), min(240))).toEqual({ sendWarning: false, complete: true });
  });

  it("never acts on sessions that aren't in progress or are already complete", () => {
    expect(reconcileDecision("COMPLETED", session({ completedAt: min(60) }), min(70))).toEqual({
      sendWarning: false,
      complete: false,
    });
    expect(reconcileDecision("CONFIRMED", null, min(70))).toEqual({ sendWarning: false, complete: false });
  });
});

describe("completion", () => {
  it("lets the trainer end the session only from the 55-minute mark", () => {
    expect(completeBlocker("IN_PROGRESS", session(), min(54, 59))).toMatch(/55-minute/);
    expect(completeBlocker("IN_PROGRESS", session(), min(55))).toBeNull();
    expect(completeBlocker("COMPLETED", session(), min(61))).toMatch(/already completed/);
    expect(completeBlocker("CONFIRMED", null, min(61))).toMatch(/in progress/);
  });

  it("records the trainer's end time, or the deadline itself once it has passed", () => {
    expect(completionFor(session(), min(57))).toEqual({ completedAt: min(57), source: "TRAINER" });
    expect(completionFor(session(), min(60))).toEqual({ completedAt: min(60), source: "DEADLINE" });
    expect(completionFor(session(), min(95))).toEqual({ completedAt: min(60), source: "DEADLINE" });
  });
});

describe("buzzer cues", () => {
  const s = session();

  it("sounds the warning when a tick crosses 55 minutes and the end when it crosses 60", () => {
    expect(buzzerCue(s, min(54, 59), min(55))).toBe("warning");
    expect(buzzerCue(s, min(59, 59), min(60))).toBe("end");
  });

  it("stays quiet between marks and on a tick that doesn't cross one", () => {
    expect(buzzerCue(s, min(30), min(30, 1))).toBeNull();
    expect(buzzerCue(s, min(55), min(55, 1))).toBeNull(); // already past the warning
    expect(buzzerCue(s, min(56), min(56))).toBeNull(); // first tick after a reload
  });

  it("prefers the end cue when one late tick spans both marks", () => {
    expect(buzzerCue(s, min(54), min(60, 30))).toBe("end");
  });

  it("doesn't buzz long after the mark, e.g. a phone woken minutes later", () => {
    expect(buzzerCue(s, min(50), min(57))).toBe("warning"); // 2 minutes late: still useful
    expect(buzzerCue(s, min(50), min(57, 1))).toBeNull();
    expect(buzzerCue(s, min(50), min(63))).toBeNull();
  });
});
