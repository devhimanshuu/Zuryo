import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBooking } from "@/server/booking/booking-service";
import { getFitnessDashboard, saveFitnessProfile } from "@/server/fitness/fitness-service";
import { NOW, alice, arun, createTestDb, request, resetAndSeed, testDeps } from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

const PROFILE = {
  fitnessLevel: "BEGINNER",
  fitnessGoals: ["STRENGTH", "CONSISTENCY"],
  goals: {
    STRENGTH: { target: "Train three times a week", targetDate: "", status: "ACTIVE" },
    CONSISTENCY: { target: "", targetDate: "", status: "ACTIVE" },
  },
  intensity: "MODERATE",
  equipment: ["MAT"],
  environment: "HOME",
  avoidExercises: "",
  accommodations: "",
  movementLimitations: "Tight shoulders",
  goalDetails: "",
};

describe("fitness profile", () => {
  it("saves a profile and keeps it after re-reading (a refresh)", async () => {
    const saved = await saveFitnessProfile(testDeps(db), alice, PROFILE);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const dash = await getFitnessDashboard(db, alice.userId, NOW);
    expect(dash.profile?.fitnessLevel).toBe("BEGINNER");
    expect(dash.profile?.fitnessGoals).toEqual(["STRENGTH", "CONSISTENCY"]);
    expect(dash.profile?.movementLimitations).toBe("Tight shoulders");
    expect(dash.profile?.assessedAt).not.toBeNull();
    expect(dash.goals.map((g) => g.goal).sort()).toEqual(["CONSISTENCY", "STRENGTH"]);
    expect(dash.goals.find((g) => g.goal === "STRENGTH")?.target).toBe("Train three times a week");
  });

  it("syncs goal tracking rows with the selection", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const updated = await saveFitnessProfile(testDeps(db), alice, {
      ...PROFILE,
      fitnessGoals: ["MOBILITY"],
      goals: { MOBILITY: { target: "", targetDate: "", status: "ACTIVE" } },
    });
    expect(updated.ok).toBe(true);
    const dash = await getFitnessDashboard(db, alice.userId, NOW);
    expect(dash.profile?.fitnessGoals).toEqual(["MOBILITY"]);
    expect(dash.goals.map((g) => g.goal)).toEqual(["MOBILITY"]);
  });

  it("rejects invalid preferences and refuses non-customers", async () => {
    const invalid = await saveFitnessProfile(testDeps(db), alice, { ...PROFILE, fitnessGoals: [] });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("VALIDATION");

    const forbidden = await saveFitnessProfile(testDeps(db), arun, PROFILE);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");
  });
});

describe("booking regression", () => {
  it("the existing booking flow still works after profile changes", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const booking = await createBooking(testDeps(db), alice, request());
    expect(booking.ok).toBe(true);
    if (!booking.ok) return;
    expect(booking.data.totalAmount).toBe("438.90");
  });
});
