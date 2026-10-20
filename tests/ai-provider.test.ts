import { describe, expect, it } from "vitest";
import {
  aiProviderFromEnv,
  anthropicProvider,
  DEFAULT_ANTHROPIC_MODEL,
  openRouterProvider,
  type TokenUsage,
} from "@/lib/ai/provider";
import type { RecommendationContext } from "@/lib/fitness/context";
import { PROSE_LIMITS, PROSE_TOLERANCE, recommendationOutputSchema } from "@/lib/fitness/recommendation-schema";
import { buildRuleBasedRecommendation } from "@/lib/fitness/templates";

const ctx: RecommendationContext = {
  customerName: "Priya",
  goal: "STRENGTH",
  level: "BEGINNER",
  age: 32,
  intensity: "MODERATE",
  environment: "HOME",
  equipment: ["MAT"],
  workoutPreferences: ["MORNING"],
  selectedGoals: ["STRENGTH"],
  avoidExercises: null,
  accommodations: null,
  movementLimitations: null,
  goalDetails: null,
  recentSessions: [],
  latestTrainerSuggestion: "Lower-body strength next time.",
  categoryCounts: {},
  recentFeedback: [],
};
const plan = buildRuleBasedRecommendation(ctx);

/** A fake fetch that records the request body and answers with the given JSON. */
function fakeFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: init.headers as Record<string, string>,
    });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const completion = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  model: "minimax/minimax-m3.1-flash:free",
  choices: [{ finish_reason: "tool_calls", message }],
  usage: { prompt_tokens: 1458, completion_tokens: 958 },
  ...extra,
});

describe("openrouter provider", () => {
  it("returns the validated plan from the forced function call and reports usage and the serving model", async () => {
    const { fn, calls } = fakeFetch(
      completion({ content: null, tool_calls: [{ function: { name: "submit_workout_plan", arguments: JSON.stringify(plan) } }] }),
    );
    let usage: TokenUsage | null = null;
    let servedBy: string | null = null;
    const out = await openRouterProvider({ apiKey: "k", model: "minimax/minimax-m3.1-flash:free", fetchFn: fn }).generateRecommendation(
      ctx,
      { onUsage: (u) => (usage = u), onServedBy: (m) => (servedBy = m) },
    );
    expect(out.goal).toBe("STRENGTH");
    expect(usage).toEqual({ inputTokens: 1458, outputTokens: 958 });
    expect(servedBy).toBe("openrouter:minimax/minimax-m3.1-flash:free");
    const req = calls[0]!;
    expect(req.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer k");
    expect(req.body.model).toBe("minimax/minimax-m3.1-flash:free");
    expect(req.body.tool_choice).toEqual({ type: "function", function: { name: "submit_workout_plan" } });
    // The prompt carries profile and history context, never contact details.
    const user = (req.body.messages as Array<{ role: string; content: string }>).find((m) => m.role === "user")!;
    expect(user.content).toContain("Age: 32");
    expect(user.content).toContain("Trainer's suggestion after the last session: Lower-body strength next time.");
  });

  it("sends a comma-separated model setting as an OpenRouter fallback list", async () => {
    const { fn, calls } = fakeFetch(
      completion({ tool_calls: [{ function: { name: "submit_workout_plan", arguments: JSON.stringify(plan) } }] }),
    );
    await openRouterProvider({ apiKey: "k", model: "a/one:free, b/two:free", fetchFn: fn }).generateRecommendation(ctx);
    expect(calls[0]!.body.models).toEqual(["a/one:free", "b/two:free"]);
    expect(calls[0]!.body.model).toBeUndefined();
  });

  it("accepts a plan returned as fenced JSON text instead of a tool call", async () => {
    const { fn } = fakeFetch(completion({ content: "```json\n" + JSON.stringify(plan) + "\n```", tool_calls: null }));
    const out = await openRouterProvider({ apiKey: "k", fetchFn: fn }).generateRecommendation(ctx);
    expect(out.title).toBe(plan.title);
  });

  it("maps rate limits, upstream errors, truncation and bad output to typed failures", async () => {
    const run = (body: unknown, status = 200) =>
      openRouterProvider({ apiKey: "k", fetchFn: fakeFetch(body, status).fn }).generateRecommendation(ctx);
    await expect(run({ error: { code: 429 } }, 429)).rejects.toMatchObject({ kind: "RATE_LIMITED" });
    await expect(run({ error: { code: 429, message: "rate-limited upstream" } })).rejects.toMatchObject({ kind: "RATE_LIMITED" });
    await expect(run({ error: { code: 502 } })).rejects.toMatchObject({ kind: "PROVIDER_ERROR" });
    await expect(run("boom", 500)).rejects.toMatchObject({ kind: "PROVIDER_ERROR" });
    await expect(
      run({
        choices: [{ finish_reason: "length", message: { tool_calls: [{ function: { name: "submit_workout_plan", arguments: '{"title": "Cut' } }] } }],
      }),
    ).rejects.toMatchObject({ kind: "INVALID_OUTPUT" });
    await expect(
      run(completion({ tool_calls: [{ function: { name: "submit_workout_plan", arguments: '{"goal":"STRENGTH"}' } }] })),
    ).rejects.toMatchObject({ kind: "INVALID_OUTPUT" });
    await expect(openRouterProvider({ apiKey: undefined }).generateRecommendation(ctx)).rejects.toMatchObject({
      kind: "UNCONFIGURED",
    });
  });
});

describe("anthropic provider request shape", () => {
  it("uses the current Haiku, no sampling override and auto tool choice, and reports usage", async () => {
    const { fn, calls } = fakeFetch({
      content: [{ type: "tool_use", name: "submit_workout_plan", input: plan }],
      usage: { input_tokens: 1200, output_tokens: 700 },
    });
    let usage: TokenUsage | null = null;
    const provider = anthropicProvider({ apiKey: "k", fetchFn: fn });
    await provider.generateRecommendation(ctx, { onUsage: (u) => (usage = u) });
    expect(provider.model).toBe(`anthropic:${DEFAULT_ANTHROPIC_MODEL}`);
    expect(calls[0]!.body.model).toBe("claude-haiku-5-5");
    expect(calls[0]!.body.temperature).toBeUndefined();
    expect(calls[0]!.body.tool_choice).toEqual({ type: "auto" });
    expect(usage).toEqual({ inputTokens: 1200, outputTokens: 700 });
  });
});

describe("provider selection", () => {
  it("prefers OpenRouter, then Anthropic, and is unconfigured with neither key", async () => {
    expect(aiProviderFromEnv({ OPENROUTER_API_KEY: "o", ANTHROPIC_API_KEY: "a" }).model).toMatch(/^openrouter:/);
    expect(aiProviderFromEnv({ OPENROUTER_MODEL: "x/y", OPENROUTER_API_KEY: "o" }).model).toBe("openrouter:x/y");
    expect(aiProviderFromEnv({ ANTHROPIC_API_KEY: "a" }).model).toBe("anthropic:claude-haiku-5-5");
    await expect(aiProviderFromEnv({}).generateRecommendation(ctx)).rejects.toMatchObject({ kind: "UNCONFIGURED" });
  });
});

describe("output validation tolerance", () => {
  it("accepts slightly wordy prose up to the tolerance, and rejects anything beyond it", () => {
    const within = { ...plan, adaptations: "a".repeat(PROSE_LIMITS.adaptations * PROSE_TOLERANCE) };
    const beyond = { ...plan, adaptations: "a".repeat(PROSE_LIMITS.adaptations * PROSE_TOLERANCE + 1) };
    expect(recommendationOutputSchema.safeParse(within).success).toBe(true);
    expect(recommendationOutputSchema.safeParse(beyond).success).toBe(false);
    // Titles keep their exact limit: the layout depends on it.
    expect(recommendationOutputSchema.safeParse({ ...plan, title: "t".repeat(81) }).success).toBe(false);
  });
});
