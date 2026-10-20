import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AiProviderError, type AiProvider } from "@/lib/ai/provider";
import { buildRuleBasedRecommendation } from "@/lib/fitness/templates";
import { createBooking } from "@/server/booking/booking-service";
import {
  generateRecommendation,
  getAiUsage,
  getFitnessDashboard,
  saveFitnessProfile,
  submitRecommendationFeedback,
  type FitnessDeps,
} from "@/server/fitness/fitness-service";
import {
  NOW,
  alice,
  arun,
  bob,
  createTestDb,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

const fakeAi = (impl: AiProvider["generateRecommendation"]): AiProvider => ({
  model: "test-model",
  generateRecommendation: impl,
});

function fitnessDeps(ai: AiProvider): FitnessDeps {
  return { ...testDeps(db), ai };
}

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

/** Context shape the fake provider receives must match what the service actually sends. */
function captureContext() {
  let captured: unknown = null;
  const ai = fakeAi(async (ctx) => {
    captured = ctx;
    return buildRuleBasedRecommendation(ctx);
  });
  return {
    ai,
    get: () =>
      captured as {
        goal: string;
        level: string | null;
        equipment: string[];
        movementLimitations: string | null;
        selectedGoals: string[];
      } | null,
  };
}

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

describe("recommendation generation", () => {
  it("uses the customer's actual profile in the context sent to the provider", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const capture = captureContext();
    const res = await generateRecommendation(fitnessDeps(capture.ai), alice, { goal: "STRENGTH" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.source).toBe("AI");
    expect(res.data.modelId).toBe("test-model");
    expect(res.data.usedFallback).toBe(false);
    const seen = capture.get();
    expect(seen?.goal).toBe("STRENGTH");
    expect(seen?.level).toBe("BEGINNER");
    expect(seen?.equipment).toEqual(["MAT"]);
    expect(seen?.movementLimitations).toBe("Tight shoulders");
    expect(seen?.selectedGoals).toEqual(["STRENGTH", "CONSISTENCY"]);
  });

  it("persists the recommendation, its snapshot and an honest request log", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const capture = captureContext();
    const res = await generateRecommendation(fitnessDeps(capture.ai), alice, { goal: "STRENGTH" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const row = await db.workoutRecommendation.findUniqueOrThrow({ where: { id: res.data.recommendationId } });
    expect(row.source).toBe("AI");
    expect(row.modelId).toBe("test-model");
    expect(row.goalSnapshot).toEqual(["STRENGTH", "CONSISTENCY"]);
    expect(row.payload).toMatchObject({ goal: "STRENGTH" });

    const logs = await db.aiRequestLog.findMany({ where: { customerId: alice.userId } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ source: "AI", outcome: "SUCCESS", errorKind: null, modelId: "test-model" });
  });

  it("falls back deterministically when the provider fails, and says so honestly", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const ai = fakeAi(async () => {
      throw new AiProviderError("TIMEOUT", "too slow");
    });
    const res = await generateRecommendation(fitnessDeps(ai), alice, { goal: "STRENGTH" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      source: "RULE_BASED",
      usedFallback: true,
      fallbackReason: "TIMEOUT",
      modelId: null,
    });

    const row = await db.workoutRecommendation.findUniqueOrThrow({ where: { id: res.data.recommendationId } });
    expect(row.source).toBe("RULE_BASED");
    expect(row.explanation).toContain("strength");
    const logs = await db.aiRequestLog.findMany({ where: { customerId: alice.userId } });
    expect(logs[0]).toMatchObject({ source: "RULE_BASED", outcome: "SUCCESS", errorKind: "TIMEOUT", modelId: null });
  });

  it("enforces the per-customer cooldown", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const ai = fakeAi(async (ctx) => buildRuleBasedRecommendation(ctx));
    const first = await generateRecommendation(fitnessDeps(ai), alice, { goal: "STRENGTH" });
    expect(first.ok).toBe(true);
    const second = await generateRecommendation(fitnessDeps(ai), alice, { goal: "STRENGTH" });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("CONFLICT");
      expect(second.error.message).toMatch(/one per minute/);
    }
    expect(await db.workoutRecommendation.count({ where: { customerId: alice.userId } })).toBe(1);
  });

  it("two simultaneous generation requests cannot store duplicate recommendations", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    let providerCalls = 0;
    const ai = fakeAi(async (ctx) => {
      providerCalls += 1;
      // Give both requests time to pass the pre-lock cooldown check before either stores.
      await new Promise((r) => setTimeout(r, 300));
      return buildRuleBasedRecommendation(ctx);
    });
    const [a, b] = await Promise.all([
      generateRecommendation(fitnessDeps(ai), alice, { goal: "STRENGTH" }),
      generateRecommendation(fitnessDeps(ai), alice, { goal: "STRENGTH" }),
    ]);
    // The advisory lock serializes the final check + insert: one succeeds, the other backs off.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    if (!loser.ok) expect(loser.error.code).toBe("CONFLICT");
    expect(await db.workoutRecommendation.count({ where: { customerId: alice.userId } })).toBe(1);
    expect(providerCalls).toBeLessThanOrEqual(2); // never a cascade of retries
  });

  it("refuses goals the customer hasn't selected", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const ai = fakeAi(async (ctx) => buildRuleBasedRecommendation(ctx));
    const res = await generateRecommendation(fitnessDeps(ai), alice, { goal: "BALANCE" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION");
  });

  it("refuses non-customers", async () => {
    const ai = fakeAi(async (ctx) => buildRuleBasedRecommendation(ctx));
    const res = await generateRecommendation(fitnessDeps(ai), arun, { goal: "STRENGTH" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("feedback and privacy", () => {
  async function makeOne() {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const ai = fakeAi(async (ctx) => buildRuleBasedRecommendation(ctx));
    const res = await generateRecommendation(fitnessDeps(ai), alice, { goal: "STRENGTH" });
    if (!res.ok) throw new Error(res.error.message);
    return res.data.recommendationId;
  }

  it("persists feedback and keeps it visible in the dashboard", async () => {
    const id = await makeOne();
    const fed = await submitRecommendationFeedback(testDeps(db), alice, {
      recommendationId: id,
      feedback: "USEFUL",
      note: "Loved the squat cues",
    });
    expect(fed.ok).toBe(true);
    const dash = await getFitnessDashboard(db, alice.userId, NOW);
    const rec = dash.recommendations.find((r) => r.id === id);
    expect(rec?.feedback).toBe("USEFUL");
    expect(rec?.feedbackNote).toBe("Loved the squat cues");
  });

  it("a customer cannot rate or see another customer's recommendations", async () => {
    const id = await makeOne();
    const foreign = await submitRecommendationFeedback(testDeps(db), bob, {
      recommendationId: id,
      feedback: "NOT_USEFUL",
      note: "",
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND");

    const bobsDash = await getFitnessDashboard(db, bob.userId, NOW);
    expect(bobsDash.recommendations.map((r) => r.id)).not.toContain(id);
  });
});

describe("operations oversight and booking regression", () => {
  it("reports AI usage from the request log", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const ok = await generateRecommendation(fitnessDeps(fakeAi(async (c) => buildRuleBasedRecommendation(c))), alice, {
      goal: "STRENGTH",
    });
    expect(ok.ok).toBe(true);
    const usage = await getAiUsage(db);
    expect(usage.aiSuccess).toBe(1);
    expect(usage.fallback).toBe(0);
  });

  it("the existing booking flow still works after profile changes", async () => {
    await saveFitnessProfile(testDeps(db), alice, PROFILE);
    const booking = await createBooking(testDeps(db), alice, request());
    expect(booking.ok).toBe(true);
    if (!booking.ok) return;
    expect(booking.data.totalAmount).toBe("438.90");
  });
});
