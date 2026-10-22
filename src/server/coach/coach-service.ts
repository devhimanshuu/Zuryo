import "server-only";
import { z } from "zod";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking/rules";
import { categoryLabel } from "@/lib/booking/categories";
import type { CoachContext } from "@/lib/coach/context";
import { runCoach, type CoachModels, type CoachResult, type CoachTurn } from "@/lib/coach/graph";
import { COACH_LIMITS } from "@/lib/coach/scope";
import type { CoachMessageView } from "@/lib/coach/thread";
import { getServerEnv } from "@/lib/config/env.server";
import { clientEnv } from "@/lib/config/env.client";
import {
  EQUIPMENT_LABELS,
  GOAL_LABELS,
  INTENSITY_LABELS,
  ENVIRONMENT_LABELS,
  PREFERENCE_LABELS,
} from "@/lib/fitness/labels";
import { getDb } from "@/lib/db";
import { formatCoachNow, formatDay, formatSlot, titleCase } from "@/lib/utils/format";
import { coachModelsFromEnv } from "@/server/coach/models";
import type { Actor } from "@/server/auth/actor";
import { DEFAULT_TX_OPTIONS, type BookingDeps, type DbOrTx } from "@/server/booking/deps";
import { fail, ok, type ServiceResult } from "@/server/booking/errors";

/**
 * The fitness coach's server side: loads the bounded context (the customer's own profile, sessions
 * and package), enforces the per-customer question limits, runs the LangGraph coach, and stores the
 * conversation. Every read and write is scoped to the acting customer; nothing trusts a
 * client-supplied id. Provider failures never lose an answer: the graph falls back to the
 * rule-based replies and the row is labelled honestly.
 */

export type CoachDeps = BookingDeps & { models: CoachModels };

export function defaultCoachDeps(): CoachDeps {
  const env = getServerEnv();
  return {
    db: getDb(),
    now: () => new Date(),
    tx: DEFAULT_TX_OPTIONS,
    models: coachModelsFromEnv({
      AI_PROVIDER: env.AI_PROVIDER,
      GROQ_API_KEY: env.GROQ_API_KEY,
      GROQ_MODEL: env.GROQ_MODEL,
      GROQ_FAST_MODEL: env.GROQ_FAST_MODEL,
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
      OPENROUTER_MODEL: env.OPENROUTER_MODEL,
      APP_URL: clientEnv.NEXT_PUBLIC_APP_URL,
    }),
  };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const THREAD_LIMIT = 40;

/** The conversation as the page renders it, oldest first. */
export async function getCoachThread(
  db: DbOrTx,
  customerId: string,
  limit = THREAD_LIMIT,
): Promise<CoachMessageView[]> {
  const rows = await db.chatMessage.findMany({
    where: { customerId },
    // `id` breaks ties: rows stored in the same millisecond still keep insertion order.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      route: true,
      source: true,
      modelId: true,
      createdAt: true,
    },
  });
  return rows.reverse().map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    route: m.route,
    source: m.source,
    modelId: m.modelId,
    createdAt: m.createdAt.toISOString(),
  }));
}

/**
 * Loads the bounded slice of the customer's own data the coach may see. No contact details,
 * address, weight or payment data; free-text fields are capped in the prompt builder.
 */
export async function loadCoachContext(
  db: DbOrTx,
  customerId: string,
  now: Date,
): Promise<CoachContext | null> {
  const profile = await db.customerProfile.findUnique({
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
      user: { select: { name: true } },
    },
  });
  if (!profile) return null;

  const [next, upcomingCount, pkg, completedCount, recent, latestPlan] = await Promise.all([
    db.booking.findFirst({
      where: { customerId, status: { in: [...ACTIVE_BOOKING_STATUSES] }, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      select: {
        startAt: true,
        workoutCategory: true,
        status: true,
        trainer: { select: { user: { select: { name: true } } } },
      },
    }),
    db.booking.count({
      where: { customerId, status: { in: [...ACTIVE_BOOKING_STATUSES] }, endAt: { gte: now } },
    }),
    db.package.findFirst({
      where: {
        customerId,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { purchasedAt: "desc" },
      select: { name: true, totalSessions: true, usedSessions: true, expiresAt: true },
    }),
    db.booking.count({ where: { customerId, status: "COMPLETED" } }),
    db.booking.findMany({
      where: { customerId, status: "COMPLETED", workoutCategory: { not: null } },
      orderBy: { startAt: "desc" },
      take: 4,
      select: {
        startAt: true,
        workoutCategory: true,
        sessionRecord: { select: { suggestedNextWorkout: true } },
      },
    }),
    db.workoutRecommendation.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: { title: true, source: true },
    }),
  ]);

  const limitations =
    [profile.movementLimitations, profile.accommodations && `Accommodations: ${profile.accommodations}`]
      .filter(Boolean)
      .join("; ") || null;

  return {
    firstName: firstName(profile.user.name),
    now: formatCoachNow(now),
    level: profile.fitnessLevel ? titleCase(profile.fitnessLevel) : null,
    goals: profile.fitnessGoals.map((g) => GOAL_LABELS[g]),
    intensity: profile.intensity ? INTENSITY_LABELS[profile.intensity] : null,
    environment: profile.environment ? ENVIRONMENT_LABELS[profile.environment] : null,
    equipment: profile.equipment.map((e) => EQUIPMENT_LABELS[e]),
    preferences: profile.workoutPreferences.map((p) => PREFERENCE_LABELS[p]),
    limitations,
    avoid: profile.avoidExercises,
    nextSession: next
      ? {
          when: formatSlot(next.startAt),
          category: categoryLabel(next.workoutCategory),
          trainerFirstName: next.trainer ? firstName(next.trainer.user.name) : null,
          status: next.status as "PENDING" | "CONFIRMED" | "IN_PROGRESS",
        }
      : null,
    upcomingCount,
    pkg: pkg
      ? {
          name: pkg.name,
          remaining: Math.max(0, pkg.totalSessions - pkg.usedSessions),
          total: pkg.totalSessions,
          validUntil: pkg.expiresAt ? formatDay(pkg.expiresAt) : null,
        }
      : null,
    completedCount,
    recentSessions: recent.map((b) => ({
      date: formatDay(b.startAt),
      category: categoryLabel(b.workoutCategory),
      trainerSuggestion: b.sessionRecord?.suggestedNextWorkout ?? null,
    })),
    latestPlan: latestPlan ? { title: latestPlan.title, source: latestPlan.source } : null,
  };
}

const askSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(2, "Write a short question.")
      .max(COACH_LIMITS.messageChars, `Keep questions under ${COACH_LIMITS.messageChars} characters.`),
  })
  .strict();

/**
 * Answers one question and stores both messages. Model calls happen outside any transaction; the
 * limits are checked before the question is stored, so a burst of requests can't fan out to the
 * providers.
 */
export async function askCoach(
  deps: CoachDeps,
  actor: Actor,
  raw: unknown,
): Promise<ServiceResult<CoachMessageView>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can chat with the coach.");
  const parsed = askSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", `Write a question between 2 and ${COACH_LIMITS.messageChars} characters.`);
  }
  const question = parsed.data.message;
  const now = deps.now();

  const context = await loadCoachContext(deps.db, actor.userId, now);
  if (!context) return fail("NOT_FOUND", "Set up your fitness profile first, then ask the coach.");

  const [lastMinute, lastDay] = await Promise.all([
    deps.db.chatMessage.count({
      where: { customerId: actor.userId, role: "USER", createdAt: { gte: new Date(now.getTime() - 60_000) } },
    }),
    deps.db.chatMessage.count({
      where: {
        customerId: actor.userId,
        role: "USER",
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
    }),
  ]);
  if (lastMinute >= COACH_LIMITS.perMinute) {
    return fail(
      "CONFLICT",
      `The coach answers ${COACH_LIMITS.perMinute} questions a minute. Give it a moment, then try again.`,
    );
  }
  if (lastDay >= COACH_LIMITS.perDay) {
    return fail(
      "CONFLICT",
      `You've reached today's limit of ${COACH_LIMITS.perDay} questions. The coach is available again tomorrow.`,
    );
  }

  const historyRows = await deps.db.chatMessage.findMany({
    where: { customerId: actor.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: COACH_LIMITS.historyMessages,
    select: { role: true, content: true },
  });
  const history: CoachTurn[] = historyRows.reverse().map((m) => ({ role: m.role, content: m.content }));

  await deps.db.chatMessage.create({
    data: { customerId: actor.userId, role: "USER", content: question, createdAt: now },
  });

  const started = Date.now();
  let result: CoachResult;
  try {
    result = await runCoach({ models: deps.models, loadContext: async () => context }, { question, history });
  } catch (err) {
    // The attempt produced nothing: record the failure honestly and let the caller report it.
    try {
      await deps.db.aiRequestLog.create({
        data: {
          customerId: actor.userId,
          feature: "COACH",
          source: "RULE_BASED",
          outcome: "FAILED",
          modelId: null,
          errorKind: "INTERNAL",
          latencyMs: Date.now() - started,
          createdAt: now,
        },
      });
    } catch {
      // Logging is best-effort; the original error is what matters.
    }
    throw err;
  }
  const latencyMs = Date.now() - started;

  if (!result.reply) throw new Error("The coach produced no reply");
  const route = result.route ?? "ANSWERED";
  const source = result.source ?? "RULE_BASED";

  const assistant = await deps.db.chatMessage.create({
    data: {
      customerId: actor.userId,
      role: "ASSISTANT",
      content: result.reply,
      route,
      source,
      modelId: result.modelId,
      createdAt: now,
    },
    select: {
      id: true,
      role: true,
      content: true,
      route: true,
      source: true,
      modelId: true,
      createdAt: true,
    },
  });

  try {
    await deps.db.aiRequestLog.create({
      data: {
        customerId: actor.userId,
        feature: "COACH",
        source,
        outcome: "SUCCESS",
        modelId: result.modelId,
        // The first failure kind before a fallback, if any, so operations sees honest quality.
        errorKind: result.errors[0] ?? null,
        latencyMs,
        inputTokens: result.usage.inputTokens || null,
        outputTokens: result.usage.outputTokens || null,
        createdAt: now,
      },
    });
  } catch {
    // Usage logging is best-effort; the answer is already stored.
  }

  return ok({
    id: assistant.id,
    role: "ASSISTANT",
    content: assistant.content,
    route: assistant.route,
    source: assistant.source,
    modelId: assistant.modelId,
    createdAt: assistant.createdAt.toISOString(),
  });
}

/** Deletes the customer's whole conversation (and only theirs). */
export async function clearCoachHistory(
  deps: BookingDeps,
  actor: Actor,
): Promise<ServiceResult<{ deleted: number }>> {
  if (actor.role !== "CUSTOMER") return fail("FORBIDDEN", "Only customers can clear their own conversation.");
  const res = await deps.db.chatMessage.deleteMany({ where: { customerId: actor.userId } });
  return ok({ deleted: res.count });
}
