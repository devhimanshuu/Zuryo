import "dotenv/config";
import { AiProviderError, aiProviderFromEnv, type AiProviderName, type TokenUsage } from "@/lib/ai/provider";
import type { RecommendationContext } from "@/lib/fitness/context";

/**
 * Live check of the configured AI provider, outside the app and the database: sends one synthetic
 * customer context, validates the structured answer and prints latency and token usage. Nothing is
 * stored. Uses whichever key is set (OPENROUTER_API_KEY first, then ANTHROPIC_API_KEY).
 *
 *   npm run ai:smoke            # one call
 *   npm run ai:smoke -- 3       # three calls, to see latency spread (mind free-tier rate limits)
 */
const SYNTHETIC: RecommendationContext = {
  customerName: "Demo Customer",
  goal: "STRENGTH",
  level: "BEGINNER",
  age: 34,
  intensity: "MODERATE",
  environment: "HOME",
  equipment: ["MAT", "DUMBBELLS"],
  workoutPreferences: ["MORNING", "BODYWEIGHT"],
  selectedGoals: ["STRENGTH", "CONSISTENCY"],
  avoidExercises: "Burpees",
  accommodations: null,
  movementLimitations: "Tight shoulders",
  goalDetails: null,
  recentSessions: [{ category: "STRENGTH", completedAt: "2026-10-15T07:00:00.000Z" }],
  latestTrainerSuggestion: "Lower-body strength with a short conditioning finisher.",
  categoryCounts: { STRENGTH: 3 },
  recentFeedback: [],
};

async function main() {
  const runs = Math.max(1, Math.min(5, Number(process.argv[2] ?? 1) || 1));
  const env = process.env;
  const provider = aiProviderFromEnv({
    AI_PROVIDER: env.AI_PROVIDER as AiProviderName | "auto" | undefined,
    GROQ_API_KEY: env.GROQ_API_KEY,
    GROQ_MODEL: env.GROQ_MODEL,
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: env.OPENROUTER_MODEL,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
  });
  console.log(`Provider: ${provider.model}`);
  for (let i = 1; i <= runs; i++) {
    let usage: TokenUsage | null = null;
    const started = Date.now();
    try {
      let servedBy = provider.model;
      const plan = await provider.generateRecommendation(SYNTHETIC, {
        onUsage: (u) => (usage = u),
        onServedBy: (m) => (servedBy = m),
      });
      const ms = Date.now() - started;
      console.log(
        `#${i} OK in ${ms} ms · served by ${servedBy} · tokens ${usage ? `${(usage as TokenUsage).inputTokens} in / ${(usage as TokenUsage).outputTokens} out` : "not reported"}`,
      );
      console.log(`   "${plan.title}" · ${plan.category} · ${plan.durationMinutes} min · ${plan.intensity}`);
      console.log(`   exercises: ${plan.exercises.map((e) => e.name).join(", ")}`);
    } catch (err) {
      const ms = Date.now() - started;
      const kind = err instanceof AiProviderError ? err.kind : "UNEXPECTED";
      console.log(
        `#${i} FAILED (${kind}) after ${ms} ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 1;
    }
  }
}

void main();
