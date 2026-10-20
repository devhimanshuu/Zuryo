import { describe, expect, it } from "vitest";
import { rescheduleBlocker, reschedulePolicyFor } from "@/lib/booking/reschedule";
import { MAX_RESCHEDULES } from "@/lib/booking/rules";
import { rescheduleBookingInputSchema } from "@/lib/validation/booking";
import { fitnessProfileSchema } from "@/lib/validation/fitness";
import {
  actualDurationMinutes,
  parseActivities,
  sessionFeedbackSchema,
  sessionSummarySchema,
} from "@/lib/validation/sessions";

const NOW = new Date("2030-01-07T04:30:00Z"); // Monday 10:00 IST
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("rescheduling rules", () => {
  const confirmed = { status: "CONFIRMED" as const, startAt: later(24 * 60), rescheduleCount: 0, trainerId: "t1" };

  it("allows a confirmed, assigned, future booking under the move limit", () => {
    expect(rescheduleBlocker(confirmed, NOW)).toBeNull();
    expect(rescheduleBlocker({ ...confirmed, rescheduleCount: MAX_RESCHEDULES - 1 }, NOW)).toBeNull();
  });

  it("refuses finished, cancelled, started, unassigned or over-moved bookings", () => {
    for (const status of ["CANCELLED", "COMPLETED", "IN_PROGRESS", "FAILED", "PENDING"] as const) {
      expect(rescheduleBlocker({ ...confirmed, status }, NOW)).not.toBeNull();
    }
    expect(rescheduleBlocker({ ...confirmed, startAt: NOW }, NOW)).toMatch(/already started/);
    expect(rescheduleBlocker({ ...confirmed, trainerId: null }, NOW)).toMatch(/no trainer/);
    expect(rescheduleBlocker({ ...confirmed, rescheduleCount: MAX_RESCHEDULES }, NOW)).toMatch(/Cancel it/);
  });

  it("lets package bookings move anywhere but keeps paid bookings at the same total", () => {
    expect(reschedulePolicyFor({ packageId: "p1" })).toBe("ANY_SLOT");
    expect(reschedulePolicyFor({ packageId: null })).toBe("SAME_TOTAL");
  });

  it("validates the new time with the scheduled-booking rules and accepts nothing else", () => {
    const schema = rescheduleBookingInputSchema(() => NOW);
    expect(schema.safeParse({ bookingId: "b1", startAt: later(24 * 60).toISOString() }).success).toBe(true);
    // Within the next hour is the instant window, not a valid scheduled move.
    expect(schema.safeParse({ bookingId: "b1", startAt: later(30).toISOString() }).success).toBe(false);
    // Off the half-hour grid.
    expect(schema.safeParse({ bookingId: "b1", startAt: later(24 * 60 + 10).toISOString() }).success).toBe(false);
    // The client can't smuggle in a trainer or a price.
    expect(
      schema.safeParse({ bookingId: "b1", startAt: later(24 * 60).toISOString(), trainerId: "t9" }).success,
    ).toBe(false);
  });
});

describe("assessment fields", () => {
  const base = { fitnessGoals: ["STRENGTH"], goals: {} };

  it("parses optional age, weight and workout preferences from form strings", () => {
    const parsed = fitnessProfileSchema.parse({
      ...base,
      age: "34",
      weightKg: "68.5",
      workoutPreferences: ["MORNING", "LOW_IMPACT"],
    });
    expect(parsed).toMatchObject({ age: 34, weightKg: 68.5, workoutPreferences: ["MORNING", "LOW_IMPACT"] });
    const blank = fitnessProfileSchema.parse({ ...base, age: "", weightKg: "" });
    expect(blank.age).toBeUndefined();
    expect(blank.weightKg).toBeUndefined();
    expect(blank.workoutPreferences).toEqual([]);
  });

  it("rejects out-of-range or malformed measurements and unknown preferences", () => {
    expect(fitnessProfileSchema.safeParse({ ...base, age: "12" }).success).toBe(false);
    expect(fitnessProfileSchema.safeParse({ ...base, age: "34.5" }).success).toBe(false);
    expect(fitnessProfileSchema.safeParse({ ...base, weightKg: "900" }).success).toBe(false);
    expect(fitnessProfileSchema.safeParse({ ...base, weightKg: "heavy" }).success).toBe(false);
    expect(fitnessProfileSchema.safeParse({ ...base, workoutPreferences: ["NAPPING"] }).success).toBe(false);
  });
});

describe("session records", () => {
  it("drops fully blank activity rows and coerces the numbers", () => {
    const parsed = sessionSummarySchema.parse({
      bookingId: "b1",
      activities: [
        { name: "Goblet squat", sets: "3", reps: "12", durationMin: "", durationSec: "" },
        { name: "", sets: "", reps: "", durationMin: "", durationSec: "" },
        { name: "Brisk walk", sets: "", reps: "", durationMin: "10", durationSec: "" },
      ],
      trainerNotes: "  Good depth.  ",
      suggestedNextWorkout: "",
    });
    expect(parsed.activities).toEqual([
      { name: "Goblet squat", sets: 3, reps: 12 },
      { name: "Brisk walk", durationMin: 10 },
    ]);
    expect(parsed.trainerNotes).toBe("Good depth.");
    expect(parsed.suggestedNextWorkout).toBeUndefined();
  });

  it("reports an invalid row at its own index, so the form can show the error in place", () => {
    const res = sessionSummarySchema.safeParse({
      bookingId: "b1",
      activities: [{ name: "", sets: "", reps: "", durationMin: "" }, { name: "x", sets: "3" }],
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]!.path).toEqual(["activities", 1, "name"]);
  });

  it("rejects extra fields: duration and timestamps are server-owned", () => {
    expect(sessionSummarySchema.safeParse({ bookingId: "b1", activities: [], completedAt: "2030-01-01" }).success).toBe(
      false,
    );
  });

  it("requires a few words of feedback and strips control characters", () => {
    expect(sessionFeedbackSchema.safeParse({ bookingId: "b1", feedback: " " }).success).toBe(false);
    expect(sessionFeedbackSchema.parse({ bookingId: "b1", feedback: "Great\u0007 pace" }).feedback).toBe("Great pace");
  });

  it("reads stored activities defensively and derives duration from server timestamps", () => {
    expect(parseActivities([{ name: "Plank", sets: 3, durationSec: 40 }, { bogus: true }, "nope"])).toEqual([
      { name: "Plank", sets: 3, durationSec: 40 },
    ]);
    expect(parseActivities(null)).toEqual([]);
    expect(actualDurationMinutes(NOW, later(60))).toBe(60);
    expect(actualDurationMinutes(NOW, null)).toBeNull();
  });
});
