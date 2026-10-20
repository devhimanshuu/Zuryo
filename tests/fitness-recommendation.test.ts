import { describe, expect, it } from "vitest";
import { anthropicProvider } from "@/lib/ai/provider";
import { cooldownRemainingMs, contextToPrompt, type RecommendationContext } from "@/lib/fitness/context";
import { recommendationOutputSchema } from "@/lib/fitness/recommendation-schema";
import { buildRuleBasedRecommendation, ruleBasedExplanation } from "@/lib/fitness/templates";
import { fitnessProfileSchema } from "@/lib/validation/fitness";

const NOW = new Date("2026-10-19T04:30:00Z");
const ctx = (patch: Partial<RecommendationContext> = {}): RecommendationContext => ({
  customerName: "Priya",
  goal: "STRENGTH",
  level: "INTERMEDIATE",
  age: 32,
  intensity: "MODERATE",
  environment: "HOME",
  equipment: ["MAT", "DUMBBELLS"],
  workoutPreferences: ["MORNING", "WEIGHTS"],
  selectedGoals: ["WEIGHT_LOSS", "STRENGTH"],
  avoidExercises: "Barbell overhead presses",
  accommodations: null,
  movementLimitations: "Tight shoulders after long desk days",
  goalDetails: "Train three times a week.",
  recentSessions: [{ category: "STRENGTH", completedAt: "2026-10-15T04:30:00.000Z" }],
  latestTrainerSuggestion: null,
  categoryCounts: { STRENGTH: 2 },
  recentFeedback: [],
  ...patch,
});

describe("rule-based fallback", () => {
  it("produces valid output for every goal and level", () => {
    for (const goal of [
      "WEIGHT_LOSS",
      "STRENGTH",
      "MOBILITY",
      "ENDURANCE",
      "POSTURE",
      "GENERAL_FITNESS",
      "CONSISTENCY",
      "BALANCE",
    ] as const) {
      for (const level of [null, "BEGINNER", "INTERMEDIATE", "ADVANCED"] as const) {
        const out = buildRuleBasedRecommendation(ctx({ goal, level }));
        expect(recommendationOutputSchema.safeParse(out).success, `${goal} ${level}`).toBe(true);
        expect(out.goal).toBe(goal);
      }
    }
  });

  it("uses the actual goal, level and equipment in the plan", () => {
    const beginner = buildRuleBasedRecommendation(ctx({ level: "BEGINNER", equipment: [] }));
    expect(beginner.intensity).toBe("LOW");
    expect(beginner.equipment).toEqual(["DUMBBELLS"]); // the template still lists what it wanted
    expect(beginner.exercises.map((e) => e.name)).not.toContain("Goblet squat"); // equipment-free variant

    const advanced = buildRuleBasedRecommendation(
      ctx({ level: "ADVANCED", movementLimitations: null, accommodations: null }),
    );
    expect(advanced.intensity).toBe("HIGH");
    expect(advanced.exercises[0]?.name).toBe("Goblet squat"); // dumbbells available
  });

  it("lowers intensity when the customer shares limitations", () => {
    const plan = buildRuleBasedRecommendation(ctx({ level: "ADVANCED", movementLimitations: "Knee pain on lunges" }));
    expect(plan.intensity).toBe("MODERATE");
    expect(plan.adaptations).toMatch(/seated|support|range|sets|pace/i);
    expect(plan.safety).toMatch(/sharp pain|dizziness/i);
  });

  it("grounds the explanation in the real context, never inventing reasons", () => {
    const explanation = ruleBasedExplanation(ctx({ level: null, equipment: [] }));
    expect(explanation).toContain("strength");
    expect(explanation).toContain("beginner (assumed)");
    expect(explanation).toContain("equipment-free");
    expect(explanation).toContain("limitations you shared");

    const plain = ruleBasedExplanation(ctx({ movementLimitations: null, accommodations: null }));
    expect(plain).not.toContain("limitations");
  });
});

describe("recommendation output validation", () => {
  const valid = () => buildRuleBasedRecommendation(ctx());

  it("rejects unsupported exercise parameters", () => {
    const bad = valid();
    bad.exercises[0] = { kind: "REPS", name: "Squat", sets: 99, reps: 500 } as never;
    expect(recommendationOutputSchema.safeParse(bad).success).toBe(false);

    const tooMany = valid();
    (tooMany as { exercises: unknown[] }).exercises = Array.from({ length: 9 }, () => ({
      kind: "TIMED",
      name: "X",
      durationMin: 5,
    }));
    expect(recommendationOutputSchema.safeParse(tooMany).success).toBe(false);

    const mixed = valid();
    mixed.exercises[0] = { kind: "REPS", name: "Squat", sets: 3, reps: 10, durationMin: 5 } as never;
    expect(recommendationOutputSchema.safeParse(mixed).success).toBe(false);
  });

  it("rejects wrong durations, categories and malformed objects", () => {
    expect(recommendationOutputSchema.safeParse({ ...valid(), durationMinutes: 90 }).success).toBe(false);
    expect(recommendationOutputSchema.safeParse({ ...valid(), durationMinutes: 10 }).success).toBe(false);
    expect(recommendationOutputSchema.safeParse({ ...valid(), category: "PILATES" }).success).toBe(false);
    expect(recommendationOutputSchema.safeParse({}).success).toBe(false);
    expect(recommendationOutputSchema.safeParse(null).success).toBe(false);
  });
});

describe("profile validation", () => {
  const valid = {
    fitnessLevel: "BEGINNER",
    fitnessGoals: ["STRENGTH", "CONSISTENCY"],
    goals: { STRENGTH: { target: "3x a week", targetDate: "", status: "ACTIVE" } },
    intensity: "MODERATE",
    equipment: ["MAT"],
    environment: "HOME",
  };

  it("accepts a sensible profile", () => {
    expect(fitnessProfileSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid enum values, unknown fields and too many goals", () => {
    expect(fitnessProfileSchema.safeParse({ ...valid, fitnessLevel: "ELITE" }).success).toBe(false);
    expect(fitnessProfileSchema.safeParse({ ...valid, intensity: "EXTREME" }).success).toBe(false);
    expect(fitnessProfileSchema.safeParse({ ...valid, medicalHistory: "..." }).success).toBe(false);
    expect(
      fitnessProfileSchema.safeParse({ ...valid, fitnessGoals: ["STRENGTH", "MOBILITY", "ENDURANCE", "POSTURE", "BALANCE"] })
        .success,
    ).toBe(false);
  });

  it("requires at least one goal so recommendations have something to work with", () => {
    expect(fitnessProfileSchema.safeParse({ ...valid, fitnessGoals: [] }).success).toBe(false);
  });

  it("rejects tracking detail for a goal that isn't selected", () => {
    const res = fitnessProfileSchema.safeParse({
      ...valid,
      goals: { MOBILITY: { target: "", targetDate: "", status: "ACTIVE" } },
    });
    expect(res.success).toBe(false);
  });
});

describe("cooldown and context", () => {
  it("computes the remaining cooldown from the last generation", () => {
    expect(cooldownRemainingMs(null, NOW)).toBe(0);
    expect(cooldownRemainingMs(new Date(NOW.getTime() - 30_000), NOW)).toBe(30_000);
    expect(cooldownRemainingMs(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe(0);
  });

  it("keeps the prompt bounded to the context fields", () => {
    const prompt = contextToPrompt(ctx());
    expect(prompt).toContain("Target goal: STRENGTH");
    expect(prompt).toContain("Movement limitations");
    expect(prompt).toMatch(/Recently completed sessions: STRENGTH \(2026-10-15\)/);
  });
});

describe("anthropic provider", () => {
  const goodResponse = {
    content: [{ type: "tool_use", name: "submit_workout_plan", input: buildRuleBasedRecommendation(ctx()) }],
  };

  it("returns validated structured output when the provider answers well", async () => {
    const provider = anthropicProvider({
      apiKey: "test-key",
      model: "claude-test",
      fetchFn: (async () => new Response(JSON.stringify(goodResponse), { status: 200 })) as typeof fetch,
    });
    const out = await provider.generateRecommendation(ctx());
    expect(out.goal).toBe("STRENGTH");
    expect(out.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects provider answers that fail validation", async () => {
    const provider = anthropicProvider({
      apiKey: "test-key",
      fetchFn: (async () =>
        new Response(JSON.stringify({ content: [{ type: "tool_use", name: "submit_workout_plan", input: { goal: "STRENGTH" } }] }), {
          status: 200,
        })) as typeof fetch,
    });
    await expect(provider.generateRecommendation(ctx())).rejects.toMatchObject({ kind: "INVALID_OUTPUT" });
  });

  it("maps HTTP errors, unparsable bodies and missing keys to provider errors", async () => {
    const failing = (response: Response) =>
      anthropicProvider({
        apiKey: "test-key",
        fetchFn: (async () => response) as typeof fetch,
      });
    await expect(failing(new Response("boom", { status: 500 })).generateRecommendation(ctx())).rejects.toMatchObject({
      kind: "PROVIDER_ERROR",
    });
    await expect(
      failing(new Response("not json", { status: 200 })).generateRecommendation(ctx()),
    ).rejects.toMatchObject({ kind: "INVALID_OUTPUT" });

    const unconfigured = anthropicProvider({ apiKey: undefined });
    await expect(unconfigured.generateRecommendation(ctx())).rejects.toMatchObject({ kind: "UNCONFIGURED" });
  });
});
