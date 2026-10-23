import "server-only";
import { getDb } from "@/lib/db";

/** Recent sessions shown in the sheet; the full record stays one link away on the bookings list. */
const HISTORY_LIMIT = 20;

/** Statuses that hold a future slot. */
const UPCOMING_STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS"] as const;
const SCHEDULED_STATUSES = ["PENDING", "CONFIRMED"] as const;

const historyInclude = {
  customer: { include: { user: { select: { name: true } } } },
  serviceZone: { select: { name: true } },
  package: { select: { name: true } },
  sessionRecord: {
    select: {
      startedAt: true,
      completedAt: true,
      completionSource: true,
      trainerNotes: true,
      suggestedNextWorkout: true,
      customerFeedback: true,
    },
  },
} as const;

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/**
 * Everything the operations trainer sheet shows for one trainer: the profile as the matcher sees it
 * (community, categories, simulated base location) and the record of what they have actually done —
 * upcoming sessions plus past bookings with the trainer's notes and the customer's feedback.
 */
export async function getOperationsTrainerDetail(trainerId: string, now = new Date(), db = getDb()) {
  const profile = await db.trainerProfile.findUnique({
    where: { userId: trainerId },
    include: {
      user: { select: { name: true, email: true, createdAt: true } },
      serviceZone: {
        select: { name: true, city: true, timezone: true, latitude: true, longitude: true },
      },
    },
  });
  if (!profile) return null;

  const [
    statusCounts,
    customers,
    feedbackCount,
    notesCount,
    upcomingCount,
    missedCount,
    upcoming,
    history,
    availability,
  ] = await Promise.all([
    db.booking.groupBy({ by: ["status"], where: { trainerId }, _count: { _all: true } }),
    db.booking.groupBy({ by: ["customerId"], where: { trainerId } }),
    db.sessionRecord.count({
      where: { booking: { trainerId }, customerFeedback: { not: null } },
    }),
    db.sessionRecord.count({ where: { booking: { trainerId }, trainerNotes: { not: null } } }),
    db.booking.count({
      where: { trainerId, status: { in: [...UPCOMING_STATUSES] }, endAt: { gte: now } },
    }),
    db.booking.count({
      where: { trainerId, status: { in: [...SCHEDULED_STATUSES] }, endAt: { lt: now } },
    }),
    db.booking.findMany({
      where: { trainerId, status: { in: [...UPCOMING_STATUSES] }, endAt: { gte: now } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 5,
      include: historyInclude,
    }),
    db.booking.findMany({
      where: {
        trainerId,
        OR: [{ status: { in: ["COMPLETED", "CANCELLED", "FAILED"] } }, { endAt: { lt: now } }],
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
      include: historyInclude,
    }),
    db.trainerAvailability.findMany({
      where: { trainerId, endAt: { gte: now } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 5,
      select: { id: true, startAt: true, endAt: true, status: true, note: true },
    }),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Partial<
    Record<string, number>
  >;

  return {
    profile: {
      userId: profile.userId,
      name: profile.user.name,
      email: profile.user.email,
      joinedAt: profile.user.createdAt.toISOString(),
      isActive: profile.isActive,
      experienceYears: profile.experienceYears,
      bio: profile.bio,
      specializations: profile.specializations,
      workoutCategories: profile.workoutCategories,
      base: {
        latitude: profile.baseLatitude?.toString() ?? null,
        longitude: profile.baseLongitude?.toString() ?? null,
      },
      zone: {
        name: profile.serviceZone.name,
        city: profile.serviceZone.city,
        timezone: profile.serviceZone.timezone,
        latitude: profile.serviceZone.latitude.toString(),
        longitude: profile.serviceZone.longitude.toString(),
      },
    },
    stats: {
      total: statusCounts.reduce((sum, s) => sum + s._count._all, 0),
      completed: byStatus.COMPLETED ?? 0,
      upcoming: upcomingCount,
      cancelled: byStatus.CANCELLED ?? 0,
      missed: missedCount,
      customers: customers.length,
      feedback: feedbackCount,
      notes: notesCount,
    },
    availability: availability.map((a) => ({
      id: a.id,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
      note: a.note,
    })),
    upcoming: upcoming.map((b) => ({
      id: b.id,
      reference: b.reference,
      startAt: b.startAt.toISOString(),
      status: b.status,
      category: b.workoutCategory,
      customerName: b.customer.user.name,
      zoneName: b.serviceZone.name,
    })),
    history: history.map((b) => ({
      id: b.id,
      reference: b.reference,
      startAt: b.startAt.toISOString(),
      status: b.status,
      mode: b.mode,
      category: b.workoutCategory,
      customerName: b.customer.user.name,
      zoneName: b.serviceZone.name,
      packageName: b.package?.name ?? null,
      cancellationReason: b.cancellationReason,
      session: b.sessionRecord
        ? {
            startedAt: iso(b.sessionRecord.startedAt),
            completedAt: iso(b.sessionRecord.completedAt),
            completionSource: b.sessionRecord.completionSource,
            trainerNotes: b.sessionRecord.trainerNotes,
            suggestedNextWorkout: b.sessionRecord.suggestedNextWorkout,
            customerFeedback: b.sessionRecord.customerFeedback,
          }
        : null,
    })),
  };
}

export type OperationsTrainerDetail = NonNullable<Awaited<ReturnType<typeof getOperationsTrainerDetail>>>;
