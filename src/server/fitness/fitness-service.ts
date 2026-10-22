import "server-only";
import { z } from "zod";
import { AiProviderError, aiProviderFromEnv, type AiProvider, type TokenUsage } from "@/lib/ai/provider";
import { clientEnv } from "@/lib/config/env.client";
import {
  cooldownRemainingMs,
  CONTEXT_MAX_FEEDBACK,
  CONTEXT_MAX_RECENT_SESSIONS,
  CONTEXT_MAX_SUGGESTION_CHARS,
  type RecommendationContext,
} from "@/lib/fitness/context";
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
    ai: aiProviderFromEnv({ ...env, APP_URL: clientEnv.NEXT_PUBLIC_APP_URL }),
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
        age: input.age ?? null,
        weightKg: input.weightKg === undefined ? null : Math.round(input.weightKg * 10) / 10,
        fitnessLevel: input.fitnessLevel ?? null,
        fitnessGoals: input.fitnessGoals,
        workoutPreferences: input.workoutPreferences,
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
        age: true,
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
        sessionRecord: { select: { completedAt: true, suggestedNextWorkout: true } },
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
    age: profile.age,
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
    latestTrainerSuggestion:
      recent.find((b) => b.sessionRecord?.suggestedNextWorkout)?.sessionRecord?.suggestedNextWorkout?.slice(
        0,
        CONTEXT_MAX_SUGGESTION_CHARS,
      ) ?? null,
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

  const ctx = await loadRecommendationContext(deps.db, actor, parsed.data.goal);
  if (!ctx) return fail("NOT_FOUND", "Set up your fitness profile first, then generate a workout.");
  if (!ctx.selectedGoals.includes(parsed.data.goal)) {
    return fail("VALIDATION", "That goal isn't on your profile. Pick one of your selected goals.");
  }

  // Cooldown fast path, then the same check again under an advisory lock below. The lock key is per
  // customer, so two simultaneous requests for the same customer serialize: whoever inserts first
  // wins, and the loser sees the fresh cooldown and returns CONFLICT instead of storing a duplicate.
  const lockKey = `zuryo:recommendation:${actor.userId}`;
  const now = deps.now();
  const initialWait = cooldownRemainingMs(await latestGenerationAt(deps.db, actor.userId), now);
  if (initialWait > 0) {
    return fail("CONFLICT", `Recommendations are limited to one per minute. Try again in ${Math.ceil(initialWait / 1000)}s.`);
  }

  let output: ReturnType<typeof buildRuleBasedRecommendation>;
  let source: RecommendationSource = "AI";
  let modelId: string | null = deps.ai.model;
  let errorKind: string | null = null;
  let usage: TokenUsage | null = null;
  // Wall-clock time of the provider call, recorded for honest latency figures (fallback included).
  const startedMs = Date.now();
  try {
    // The provider call is deliberately outside any database transaction: it can take seconds and
    // must not hold a pooled connection (or a lock) open while waiting.
    output = await deps.ai.generateRecommendation(ctx, {
      onUsage: (u) => (usage = u),
      // Under model routing the answering model can differ from the first one configured.
      onServedBy: (m) => (modelId = m),
    });
  } catch (err) {
    source = "RULE_BASED";
    modelId = null;
    errorKind = err instanceof AiProviderError ? err.kind : "PROVIDER_ERROR";
    // The fallback never fails: it is local and deterministic.
    output = buildRuleBasedRecommendation(ctx);
  }
  const latencyMs = Date.now() - startedMs;
  const tokens = usage as TokenUsage | null;
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      // Under the lock the cooldown is authoritative: a concurrent request that just stored a
      // recommendation makes this one back off instead of creating a duplicate.
      const waitMs = cooldownRemainingMs(await latestGenerationAt(tx, actor.userId), now);
      if (waitMs > 0) {
        return fail<GenerationResult>(
          "CONFLICT",
          `Recommendations are limited to one per minute. Try again in ${Math.ceil(waitMs / 1000)}s.`,
        );
      }
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
          latencyMs,
          inputTokens: tokens?.inputTokens ?? null,
          outputTokens: tokens?.outputTokens ?? null,
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
          latencyMs,
          createdAt: now,
        },
      });
    } catch {
      // Logging is best-effort; the original error is what matters.
    }
    throw err;
  }
}

/** The most recent generation time for a customer (used by the cooldown checks). */
async function latestGenerationAt(db: DbOrTx, customerId: string): Promise<Date | null> {
  const last = await db.workoutRecommendation.findFirst({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt ?? null;
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
  // Recommendation figures only: coach questions are logged with feature COACH and must not be
  // counted as workout recommendations.
  const feature = "RECOMMENDATION" as const;
  const [bySource, failures, recent, measured] = await Promise.all([
    db.aiRequestLog.groupBy({ by: ["source", "outcome"], where: { feature }, _count: { _all: true } }),
    db.aiRequestLog.groupBy({
      by: ["errorKind"],
      where: { feature, errorKind: { not: null } },
      _count: { _all: true },
    }),
    db.aiRequestLog.findMany({
      where: { feature, errorKind: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { source: true, errorKind: true, createdAt: true },
    }),
    // Measured figures for successful AI calls only (fallback rows have no provider tokens).
    db.aiRequestLog.aggregate({
      where: { feature, source: "AI", outcome: "SUCCESS", latencyMs: { not: null } },
      _avg: { latencyMs: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
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
    measured: {
      calls: measured._count._all,
      avgLatencyMs: measured._avg.latencyMs === null ? null : Math.round(measured._avg.latencyMs),
      avgInputTokens: measured._avg.inputTokens === null ? null : Math.round(measured._avg.inputTokens),
      avgOutputTokens: measured._avg.outputTokens === null ? null : Math.round(measured._avg.outputTokens),
    },
  };
}

export type RecommendationFeedbackValue = RecommendationFeedback;
