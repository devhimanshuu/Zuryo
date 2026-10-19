import "server-only";
import { z } from "zod";
import { AiProviderError, anthropicProvider, type AiProvider } from "@/lib/ai/provider";
import { cooldownRemainingMs, CONTEXT_MAX_FEEDBACK, CONTEXT_MAX_RECENT_SESSIONS, type RecommendationContext } from "@/lib/fitness/context";
import { recommendationOutputSchema } from "@/lib/fitness/recommendation-schema";
import { buildRuleBasedRecommendation, ruleBasedExplanation } from "@/lib/fitness/templates";
import { getServerEnv } from "@/lib/config/env.server";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking/rules";
import { getDb } from "@/lib/db";
import type { FitnessGoal, RecommendationFeedback, RecommendationSource, RecommendationStatus } from "@/lib/validation/enums";
import { fitnessProfileSchema, generateRecommendationSchema } from "@/lib/validation/fitness";
import type { Actor } from "@/server/auth/actor";
import type { BookingDeps, DbOrTx } from "@/server/booking/deps";
import { fail, ok, type ServiceResult } from "@/server/booking/errors";

/**
 * Phase 4 fitness domain services: profile editing, recommendation generation (AI with a
 * deterministic fallback), history, feedback and honest usage logging. Everything is scoped to the
 * acting customer; nothing here trusts a client-supplied customer id.
 */

export type FitnessDeps = BookingDeps & { ai: AiProvider };

export function defaultFitnessDeps(): FitnessDeps {
  const env = getServerEnv();
  return {
    db: getDb(),
    now: () => new Date(),
    tx: { maxWait: 10_000, timeout: 15_000 },
    ai: anthropicProvider({ apiKey: env.ANTHROPIC_API_KEY || undefined, model: env.ANTHROPIC_MODEL }),
  };
}

// ─── Dashboard reads ────────────────────────────────────────────────────

export async function getFitnessDashboard(db: DbOrTx, customerId: string, now: Date) {
  const [profile, goals, recommendations, stats, sessions] = await Promise.all([
    db.customerProfile.findUnique({
      where: { userId: customerId },
      select: {
        fitnessLevel: true,
        fitnessGoals: true,
        workoutPreferences: true,
        intensity: true,
        equipment: true,
        environment: true,
        avoidExercises: true,
        accommodations: true,
        movementLimitations: true,
        goalDetails: true,
        assessedAt: true,
        age: true,
        weightKg: true,
      },
    }),
    db.fitnessGoalTracking.findMany({ where: { customerId }, orderBy: { goal: "asc" } }),
    db.workoutRecommendation.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    Promise.all([
      db.booking.count({ where: { customerId, status: "COMPLETED" } }),
      db.booking.count({
        where: { customerId, status: "COMPLETED", endAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
      }),
      db.booking.count({
        where: { customerId, status: { in: [...ACTIVE_BOOKING_STATUSES] }, endAt: { gte: now } },
      }),
      db.booking.groupBy({
        by: ["workoutCategory"],
        where: { customerId, status: "COMPLETED", workoutCategory: { not: null } },
        _count: { _all: true },
      }),
    ]),
    db.sessionRecord.findMany({
      where: { booking: { customerId }, completedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { booking: { include: { trainer: { include: { user: { select: { name: true } } } } } } },
    }),
  ]);
  const [completedCount, completedLast30Days, upcomingCount, categoryRows] = stats;
  return {
    profile,
    goals,
    recommendations,
    stats: {
      completedCount,
      completedLast30Days,
      upcomingCount,
      categories: categoryRows.map((r) => ({ category: r.workoutCategory as string, count: r._count._all })),
    },
    sessions,
  };
}

// ─── Profile editing ────────────────────────────────────────────────────

export async function saveFitnessProfile(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ goals: number }>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can edit a fitness profile.");
  const parsed = fitnessProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Some profile details need another look.", {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    });
  }
  const input = parsed.data;
  const now = deps.now();

  return deps.db.$transaction(async (tx) => {
    const profile = await tx.customerProfile.findUnique({
      where: { userId: actor.userId },
      select: { userId: true, assessedAt: true },
    });
    if (!profile) return fail<{ goals: number }>("NOT_FOUND", "We couldn't find your customer profile.");

    await tx.customerProfile.update({
      where: { userId: actor.userId },
      data: {
        fitnessLevel: input.fitnessLevel ?? null,
        fitnessGoals: input.fitnessGoals,
        intensity: input.intensity ?? null,
        equipment: input.equipment,
        environment: input.environment ?? null,
        avoidExercises: input.avoidExercises ?? null,
        accommodations: input.accommodations ?? null,
        movementLimitations: input.movementLimitations ?? null,
        goalDetails: input.goalDetails ?? null,
        // First save counts as "assessed" for the read-only summary elsewhere.
        assessedAt: profile.assessedAt ?? now,
      },
    });

    // Keep the per-goal tracking rows in step with the selection: upsert the selected ones, remove
    // deselected ones (the recommendation's goalSnapshot preserves the historical view).
    await tx.fitnessGoalTracking.deleteMany({
      where: { customerId: actor.userId, goal: { notIn: input.fitnessGoals } },
    });
    for (const goal of input.fitnessGoals) {
      const detail = input.goals[goal] ?? { status: "ACTIVE" as const };
      await tx.fitnessGoalTracking.upsert({
        where: { customerId_goal: { customerId: actor.userId, goal } },
        create: {
          customerId: actor.userId,
          goal,
          status: detail.status,
          target: detail.target || null,
          targetDate: detail.targetDate ? new Date(detail.targetDate) : null,
        },
        update: {
          status: detail.status,
          target: detail.target || null,
          targetDate: detail.targetDate ? new Date(detail.targetDate) : null,
        },
      });
    }
    return ok({ goals: input.fitnessGoals.length });
  }, deps.tx);
}

// ─── Recommendation generation ──────────────────────────────────────────

/** Loads the bounded context the provider (or fallback) is allowed to see. */
async function loadRecommendationContext(db: DbOrTx, actor: Actor, goal: FitnessGoal): Promise<RecommendationContext | null> {
  const [profile, recent, counts, feedback] = await Promise.all([
    db.customerProfile.findUnique({
      where: { userId: actor.userId },
      select: {
        fitnessLevel: true,
        fitnessGoals: true,
        workoutPreferences: true,
        intensity: true,
        equipment: true,
        environment: true,
        avoidExercises: true,
        accommodations: true,
        movementLimitations: true,
        goalDetails: true,
        user: { select: { name: true } },
      },
    }),
    db.booking.findMany({
      where: { customerId: actor.userId, status: "COMPLETED", workoutCategory: { not: null } },
      orderBy: { startAt: "desc" },
      take: CONTEXT_MAX_RECENT_SESSIONS,
      select: {
        workoutCategory: true,
        sessionRecord: { select: { completedAt: true } },
        endAt: true,
      },
    }),
    db.booking.groupBy({
      by: ["workoutCategory"],
      where: { customerId: actor.userId, status: "COMPLETED", workoutCategory: { not: null } },
      _count: { _all: true },
    }),
    db.workoutRecommendation.findMany({
      where: { customerId: actor.userId, feedback: { not: null } },
      orderBy: { feedbackAt: "desc" },
      take: CONTEXT_MAX_FEEDBACK,
      select: { feedback: true, feedbackNote: true },
    }),
  ]);
  if (!profile) return null;
  const categoryCounts: Record<string, number> = {};
  for (const r of counts) categoryCounts[r.workoutCategory as string] = r._count._all;
  return {
    customerName: profile.user.name,
    goal,
    level: profile.fitnessLevel,
    intensity: profile.intensity,
    environment: profile.environment,
    equipment: profile.equipment,
    workoutPreferences: profile.workoutPreferences,
    selectedGoals: profile.fitnessGoals,
    avoidExercises: profile.avoidExercises,
    accommodations: profile.accommodations,
    movementLimitations: profile.movementLimitations,
    goalDetails: profile.goalDetails,
    recentSessions: recent.map((b) => ({
      category: b.workoutCategory as NonNullable<typeof b.workoutCategory>,
      completedAt: (b.sessionRecord?.completedAt ?? b.endAt).toISOString(),
    })),
    categoryCounts,
    recentFeedback: feedback
      .filter((f) => f.feedback !== null)
      .map((f) => ({ feedback: f.feedback as "USEFUL" | "NOT_USEFUL", note: f.feedbackNote })),
  };
}

export type GenerationResult = {
  recommendationId: string;
  source: RecommendationSource;
  /** True when the AI provider failed and the rule-based fallback produced this instead. */
  usedFallback: boolean;
  fallbackReason: string | null;
  title: string;
  category: string;
  durationMinutes: number;
  intensity: string;
  modelId: string | null;
};

export async function generateRecommendation(
  deps: FitnessDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<GenerationResult>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can generate recommendations.");
  const parsed = generateRecommendationSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose one of your goals to generate a workout for.");

  const now = deps.now();
  const last = await deps.db.workoutRecommendation.findFirst({
    where: { customerId: actor.userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const waitMs = cooldownRemainingMs(last?.createdAt ?? null, now);
  if (waitMs > 0) {
    return fail("CONFLICT", `Recommendations are limited to one per minute. Try again in ${Math.ceil(waitMs / 1000)}s.`);
  }

  const ctx = await loadRecommendationContext(deps.db, actor, parsed.data.goal);
  if (!ctx) return fail("NOT_FOUND", "Set up your fitness profile first, then generate a workout.");
  if (!ctx.selectedGoals.includes(parsed.data.goal)) {
    return fail("VALIDATION", "That goal isn't on your profile. Pick one of your selected goals.");
  }

  let output: ReturnType<typeof buildRuleBasedRecommendation>;
  let source: RecommendationSource = "AI";
  let modelId: string | null = deps.ai.model;
  let errorKind: string | null = null;
  try {
    output = await deps.ai.generateRecommendation(ctx);
  } catch (err) {
    source = "RULE_BASED";
    modelId = null;
    errorKind = err instanceof AiProviderError ? err.kind : "PROVIDER_ERROR";
    // The fallback never fails: it is local and deterministic.
    output = buildRuleBasedRecommendation(ctx);
  }
  const payload = recommendationOutputSchema.parse(output);

  const preferenceSnapshot = {
    level: ctx.level,
    intensity: ctx.intensity,
    equipment: ctx.equipment,
    environment: ctx.environment,
    workoutPreferences: ctx.workoutPreferences,
    movementLimitations: ctx.movementLimitations,
    accommodations: ctx.accommodations,
  };

  const explanation =
    source === "RULE_BASED"
      ? ruleBasedExplanation(ctx)
      : aiExplanation(ctx, payload.goal);

  try {
    return await deps.db.$transaction(async (tx) => {
      const rec = await tx.workoutRecommendation.create({
        data: {
          customerId: actor.userId,
          source,
          goal: payload.goal,
          category: payload.category,
          title: payload.title,
          explanation,
          durationMinutes: payload.durationMinutes,
          intensity: payload.intensity,
          goalSnapshot: ctx.selectedGoals,
          preferenceSnapshot: preferenceSnapshot as object,
          payload: payload as object,
          modelId,
          // The injected clock, so cooldown and history are deterministic under test.
          createdAt: now,
        },
        select: { id: true },
      });
      await tx.aiRequestLog.create({
        data: {
          customerId: actor.userId,
          source,
          outcome: "SUCCESS",
          modelId,
          errorKind,
          createdAt: now,
        },
      });
      return ok<GenerationResult>({
        recommendationId: rec.id,
        source,
        usedFallback: source === "RULE_BASED",
        fallbackReason: errorKind,
        title: payload.title,
        category: payload.category,
        durationMinutes: payload.durationMinutes,
        intensity: payload.intensity,
        modelId,
      });
    }, deps.tx);
  } catch (err) {
    // The attempt produced nothing: record the failure honestly and report it generically.
    try {
      await deps.db.aiRequestLog.create({
        data: {
          customerId: actor.userId,
          source,
          outcome: "FAILED",
          modelId,
          errorKind: "INTERNAL",
          createdAt: now,
        },
      });
    } catch {
      // Logging is best-effort; the original error is what matters.
    }
    throw err;
  }
}

/** Grounded explanation for AI rows: states exactly the inputs the model was given, nothing more. */
function aiExplanation(ctx: RecommendationContext, goal: FitnessGoal): string {
  const level = ctx.level ? ctx.level.toLowerCase() : "beginner (assumed)";
  const equipment = ctx.equipment.length
    ? ctx.equipment.map((e) => e.replaceAll("_", " ").toLowerCase()).join(", ")
    : "equipment-free";
  const parts = [
    `Generated by the AI from your profile: goal ${goal.replaceAll("_", " ").toLowerCase()}, ${level} level, ${equipment} training`,
  ];
  if (ctx.movementLimitations) parts.push("and your stated movement limitations");
  return `${parts.join(", ")}.`;
}

// ─── Feedback & lifecycle ───────────────────────────────────────────────

const feedbackSchema = z
  .object({
    recommendationId: z.string().trim().min(1).max(40),
    feedback: z.enum(["USEFUL", "NOT_USEFUL"]),
    note: z.string().trim().max(300, "Note must be under 300 characters").optional().or(z.literal("")),
  })
  .strict();

export async function submitRecommendationFeedback(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ recommendationId: string }>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can rate their own recommendations.");
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose useful or not useful.");
  const res = await deps.db.workoutRecommendation.updateMany({
    where: { id: parsed.data.recommendationId, customerId: actor.userId },
    data: {
      feedback: parsed.data.feedback,
      feedbackNote: parsed.data.note || null,
      feedbackAt: deps.now(),
    },
  });
  return res.count === 1
    ? ok({ recommendationId: parsed.data.recommendationId })
    : fail("NOT_FOUND", "We couldn't find that recommendation.");
}

const statusSchema = z.object({ recommendationId: z.string().trim().min(1).max(40), status: z.enum(["ACTIVE", "ARCHIVED"]) }).strict();

export async function setRecommendationStatus(
  deps: BookingDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<{ recommendationId: string; status: RecommendationStatus }>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can manage their recommendations.");
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a valid status.");
  const res = await deps.db.workoutRecommendation.updateMany({
    where: { id: parsed.data.recommendationId, customerId: actor.userId },
    data: { status: parsed.data.status },
  });
  return res.count === 1
    ? ok({ recommendationId: parsed.data.recommendationId, status: parsed.data.status })
    : fail("NOT_FOUND", "We couldn't find that recommendation.");
}

// ─── Operations oversight ───────────────────────────────────────────────

/** Honest AI usage figures: counts straight from the request log, plus recent failure kinds. */
export async function getAiUsage(db: DbOrTx) {
  const [bySource, failures, recent] = await Promise.all([
    db.aiRequestLog.groupBy({ by: ["source", "outcome"], _count: { _all: true } }),
    db.aiRequestLog.groupBy({ by: ["errorKind"], where: { errorKind: { not: null } }, _count: { _all: true } }),
    db.aiRequestLog.findMany({
      where: { errorKind: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { source: true, errorKind: true, createdAt: true },
    }),
  ]);
  const count = (source: RecommendationSource, outcome: "SUCCESS" | "FAILED") =>
    bySource.find((r) => r.source === source && r.outcome === outcome)?._count._all ?? 0;
  return {
    aiSuccess: count("AI", "SUCCESS"),
    aiFailed: count("AI", "FAILED"),
    fallback: count("RULE_BASED", "SUCCESS"),
    failuresByKind: failures.map((f) => ({ kind: f.errorKind as string, count: f._count._all })),
    recentFailures: recent.map((r) => ({ source: r.source, kind: r.errorKind, at: r.createdAt })),
  };
}

export type RecommendationFeedbackValue = RecommendationFeedback;
