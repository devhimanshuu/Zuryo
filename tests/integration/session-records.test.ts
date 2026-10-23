import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBooking } from "@/server/booking/booking-service";
import { saveFitnessProfile } from "@/server/fitness/fitness-service";
import {
  completeSession,
  saveSessionSummary,
  startSession,
  submitSessionFeedback,
} from "@/server/sessions/session-service";
import {
  TOMORROW,
  alice,
  arun,
  bela,
  bob,
  createTestDb,
  ist,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

const SUMMARY = {
  activities: [
    { name: "Goblet squat", sets: "3", reps: "12", durationMin: "", durationSec: "" },
    { name: "Brisk walk", sets: "", reps: "", durationMin: "10", durationSec: "" },
  ],
  trainerNotes: "Good depth. Keep elbows tucked on rows.",
  suggestedNextWorkout: "Lower-body strength with a short conditioning finisher.",
};

async function bookTomorrow() {
  const res = await createBooking(
    testDeps(db),
    alice,
    request({ startAt: ist(TOMORROW, "10:00").toISOString(), preferredTrainerId: arun.userId }),
  );
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

async function startAndComplete(bookingId: string) {
  const started = await startSession(testDeps(db, ist(TOMORROW, "09:45")), arun, { bookingId });
  if (!started.ok) throw new Error(started.error.message);
  const done = await completeSession(testDeps(db, ist(TOMORROW, "10:41")), arun, { bookingId });
  if (!done.ok) throw new Error(done.error.message);
}

describe("trainer session summary", () => {
  it("is only accepted from the assigned trainer once the session has started", async () => {
    const id = await bookTomorrow();
    const early = await saveSessionSummary(testDeps(db), arun, { bookingId: id, ...SUMMARY });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe("CONFLICT");

    await startAndComplete(id);
    const other = await saveSessionSummary(testDeps(db), bela, { bookingId: id, ...SUMMARY });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.code).toBe("NOT_FOUND");
    const customer = await saveSessionSummary(testDeps(db), alice, { bookingId: id, ...SUMMARY });
    expect(customer.ok).toBe(false);
    if (!customer.ok) expect(customer.error.code).toBe("FORBIDDEN");

    const res = await saveSessionSummary(testDeps(db), arun, { bookingId: id, ...SUMMARY });
    expect(res.ok).toBe(true);
    const record = await db.sessionRecord.findUniqueOrThrow({ where: { bookingId: id } });
    expect(record.activities).toEqual([
      { name: "Goblet squat", sets: 3, reps: 12 },
      { name: "Brisk walk", durationMin: 10 },
    ]);
    expect(record.trainerNotes).toBe(SUMMARY.trainerNotes);
    expect(record.suggestedNextWorkout).toBe(SUMMARY.suggestedNextWorkout);
    // The server's timestamps are untouched by the summary.
    expect(record.startedAt).toEqual(ist(TOMORROW, "09:45"));
    expect(record.completedAt).toEqual(ist(TOMORROW, "10:41"));
  });
});

describe("customer session feedback", () => {
  it("can only be left by the booking's customer on a completed session", async () => {
    const id = await bookTomorrow();
    const tooSoon = await submitSessionFeedback(testDeps(db), alice, {
      bookingId: id,
      feedback: "Looking forward",
    });
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.error.code).toBe("CONFLICT");

    await startAndComplete(id);
    const stranger = await submitSessionFeedback(testDeps(db), bob, {
      bookingId: id,
      feedback: "Not my session",
    });
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.error.code).toBe("NOT_FOUND");
    const trainer = await submitSessionFeedback(testDeps(db), arun, {
      bookingId: id,
      feedback: "Self-review",
    });
    expect(trainer.ok).toBe(false);

    expect(
      (await submitSessionFeedback(testDeps(db), alice, { bookingId: id, feedback: "Loved the pace." })).ok,
    ).toBe(true);
    expect(
      (
        await submitSessionFeedback(testDeps(db), alice, {
          bookingId: id,
          feedback: "Loved it; shoulders tight.",
        })
      ).ok,
    ).toBe(true);
    const record = await db.sessionRecord.findUniqueOrThrow({ where: { bookingId: id } });
    expect(record.customerFeedback).toBe("Loved it; shoulders tight.");
  });
});

describe("assessment fields", () => {
  it("saves age, weight and preferences", async () => {
    const saved = await saveFitnessProfile(testDeps(db), alice, {
      age: "34",
      weightKg: "68.46",
      fitnessLevel: "BEGINNER",
      fitnessGoals: ["STRENGTH"],
      workoutPreferences: ["MORNING", "BODYWEIGHT"],
      goals: {},
      equipment: ["MAT"],
    });
    expect(saved.ok).toBe(true);
    const profile = await db.customerProfile.findUniqueOrThrow({ where: { userId: alice.userId } });
    expect(profile.age).toBe(34);
    expect(String(profile.weightKg)).toBe("68.5");
    expect(profile.workoutPreferences).toEqual(["MORNING", "BODYWEIGHT"]);
  });
});
