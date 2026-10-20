import type { FitnessGoal, FitnessLevel, WorkoutCategory } from "@/lib/validation/enums";

/**
 * The exact, bounded input a recommendation is generated from. Nothing else about the customer is
 * ever sent to a provider: no bookings beyond the session summaries below, no payments, no packages,
 * no notifications, no contact details, no addresses, and no body weight (data minimisation: age is
 * enough to keep a plan conservative).
 */
export type RecommendationContext = {
  customerName: string;
  goal: FitnessGoal;
  level: FitnessLevel | null;
  /** Optional, from the assessment. Used only to keep intensity appropriate. */
  age: number | null;
  intensity: string | null;
  environment: string | null;
  equipment: string[];
  workoutPreferences: string[];
  /** The customer's selected goals at generation time (the "goal snapshot"). */
  selectedGoals: FitnessGoal[];
  avoidExercises: string | null;
  accommodations: string | null;
  movementLimitations: string | null;
  goalDetails: string | null;
  /** Category + completion month of the most recent completed sessions, oldest first. */
  recentSessions: Array<{ category: WorkoutCategory; completedAt: string }>;
  /** The trainer's "suggested next workout" from the most recent completed session, capped. */
  latestTrainerSuggestion: string | null;
  /** How many completed sessions the customer has per category. */
  categoryCounts: Record<string, number>;
  /** The latest feedback on earlier recommendations, oldest first. */
  recentFeedback: Array<{ feedback: "USEFUL" | "NOT_USEFUL"; note: string | null }>;
};

/** How many completed sessions may be summarised into the context. */
export const CONTEXT_MAX_RECENT_SESSIONS = 5;
/** How many prior feedback entries are included. */
export const CONTEXT_MAX_FEEDBACK = 3;
/** Cap on the trainer suggestion carried into the prompt. */
export const CONTEXT_MAX_SUGGESTION_CHARS = 200;

/** Minimum pause between two recommendation generations for one customer (DB-backed, per customer). */
export const RECOMMENDATION_COOLDOWN_MINUTES = 1;

export function cooldownRemainingMs(lastGeneratedAt: Date | null, now: Date): number {
  if (!lastGeneratedAt) return 0;
  return Math.max(0, lastGeneratedAt.getTime() + RECOMMENDATION_COOLDOWN_MINUTES * 60_000 - now.getTime());
}

/** A compact, readable summary of the context for the provider prompt. No raw profile fields leak. */
export function contextToPrompt(ctx: RecommendationContext): string {
  const lines = [
    `Customer: ${ctx.customerName}`,
    `Target goal: ${ctx.goal}`,
    `Selected goals: ${ctx.selectedGoals.join(", ")}`,
    `Experience level: ${ctx.level ?? "unknown (assume beginner)"}`,
    `Age: ${ctx.age ?? "not stated"}`,
    `Preferred intensity: ${ctx.intensity ?? "not stated"}`,
    `Preferred environment: ${ctx.environment ?? "not stated"}`,
    `Equipment available: ${ctx.equipment.length ? ctx.equipment.join(", ") : "none stated"}`,
    `Workout preferences: ${ctx.workoutPreferences.length ? ctx.workoutPreferences.join(", ") : "none stated"}`,
  ];
  if (ctx.avoidExercises) lines.push(`Exercises/activities to avoid: ${ctx.avoidExercises}`);
  if (ctx.movementLimitations) lines.push(`Movement limitations (voluntary): ${ctx.movementLimitations}`);
  if (ctx.accommodations) lines.push(`Accommodations (voluntary): ${ctx.accommodations}`);
  if (ctx.goalDetails) lines.push(`Goal notes (voluntary): ${ctx.goalDetails}`);
  if (ctx.recentSessions.length > 0) {
    lines.push(
      `Recently completed sessions: ${ctx.recentSessions
        .map((s) => `${s.category} (${s.completedAt.slice(0, 10)})`)
        .join("; ")}`,
    );
  }
  if (ctx.latestTrainerSuggestion) {
    lines.push(`Trainer's suggestion after the last session: ${ctx.latestTrainerSuggestion}`);
  }
  if (ctx.recentFeedback.length > 0) {
    lines.push(
      `Feedback on earlier recommendations: ${ctx.recentFeedback
        .map((f) => `${f.feedback}${f.note ? ` — ${f.note}` : ""}`)
        .join("; ")}`,
    );
  }
  return lines.join("\n");
}
