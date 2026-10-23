import "server-only";
import { z } from "zod";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking/rules";
import { fitnessProfileSchema } from "@/lib/validation/fitness";
import type { Actor } from "@/server/auth/actor";
import type { BookingDeps, DbOrTx } from "@/server/booking/deps";
import { fail, ok, type ServiceResult } from "@/server/booking/errors";

/**
 * Fitness domain services: profile editing and the customer's progress dashboard. Everything is
 * scoped to the acting customer; nothing here trusts a client-supplied customer id.
 */

// ─── Dashboard reads ────────────────────────────────────────────────────

export async function getFitnessDashboard(db: DbOrTx, customerId: string, now: Date) {
  const [profile, goals, stats, sessions, activity] = await Promise.all([
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
    db.booking.findMany({
      where: {
        customerId,
        status: "COMPLETED",
        endAt: { gte: new Date(now.getTime() - 12 * 7 * 86_400_000) },
      },
      orderBy: { endAt: "desc" },
      select: { endAt: true },
    }),
  ]);
  const [completedCount, completedLast30Days, upcomingCount, categoryRows] = stats;
  return {
    profile,
    goals,
    stats: {
      completedCount,
      completedLast30Days,
      upcomingCount,
      categories: categoryRows.map((r) => ({ category: r.workoutCategory as string, count: r._count._all })),
    },
    sessions,
    activityDates: activity.map((a) => a.endAt),
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
    // deselected ones.
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
