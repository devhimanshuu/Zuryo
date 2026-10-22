import "server-only";
import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { PAGE_SIZES, paginateRows } from "@/lib/pagination";

const bookingInclude = {
  customer: { include: { user: { select: { name: true } } } },
  serviceZone: { select: { name: true } },
} as const;

export async function getTrainerOverview(userId: string, dayStart: Date, dayEnd: Date) {
  const db = getDb();
  const upcomingWhere: Prisma.BookingWhereInput = {
    trainerId: userId,
    startAt: { gte: dayEnd },
    status: { in: ["CONFIRMED", "PENDING"] },
  };
  const [profile, today, upcoming, upcomingCount, notifications] = await Promise.all([
    db.trainerProfile.findUnique({ where: { userId }, include: { serviceZone: { select: { name: true } } } }),
    db.booking.findMany({
      where: {
        trainerId: userId,
        startAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ["CANCELLED", "FAILED"] },
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      include: bookingInclude,
    }),
    db.booking.findMany({
      where: upcomingWhere,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 5,
      include: bookingInclude,
    }),
    db.booking.count({ where: upcomingWhere }),
    db.notification.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return { profile, today, upcoming, upcomingCount, notifications };
}

export const TRAINER_SESSION_TABS = ["upcoming", "completed", "cancelled", "missed"] as const;
export type TrainerSessionTab = (typeof TRAINER_SESSION_TABS)[number];

/** Statuses that still occupy the calendar; IN_PROGRESS rows are pinned as "live" instead. */
const SCHEDULED_STATUSES = ["PENDING", "CONFIRMED"] as const;

function trainerTabWhere(tab: TrainerSessionTab, userId: string, now: Date): Prisma.BookingWhereInput {
  // Declined-payment bookings never became sessions, so trainers never see FAILED rows.
  switch (tab) {
    case "upcoming":
      return { trainerId: userId, status: { in: [...SCHEDULED_STATUSES] }, endAt: { gte: now } };
    case "completed":
      return { trainerId: userId, status: "COMPLETED" };
    case "cancelled":
      return { trainerId: userId, status: "CANCELLED" };
    case "missed":
      return { trainerId: userId, status: { in: [...SCHEDULED_STATUSES] }, endAt: { lt: now } };
  }
}

/**
 * Same tab/page model as the customer list. Exact per-tab counts, soonest-first upcoming, and
 * in-progress sessions pinned above the list so the trainer can always start or complete them.
 */
export async function getTrainerSessions(
  userId: string,
  tab: TrainerSessionTab = "upcoming",
  page = 1,
  now: Date = new Date(),
  db = getDb(),
) {
  const include = {
    ...bookingInclude,
    sessionRecord: { select: { startedAt: true, endsAt: true, completedAt: true, completionSource: true } },
  };

  const [result, countEntries, live] = await Promise.all([
    paginateRows({
      page,
      pageSize: PAGE_SIZES.trainerSessions,
      count: () => db.booking.count({ where: trainerTabWhere(tab, userId, now) }),
      rows: (skip, take) =>
        db.booking.findMany({
          where: trainerTabWhere(tab, userId, now),
          orderBy: [{ startAt: tab === "upcoming" ? "asc" : "desc" }, { id: "desc" }],
          skip,
          take,
          include,
        }),
    }),
    Promise.all(
      TRAINER_SESSION_TABS.map(
        async (each) =>
          [each, await db.booking.count({ where: trainerTabWhere(each, userId, now) })] as const,
      ),
    ),
    db.booking.findMany({
      where: { trainerId: userId, status: "IN_PROGRESS" },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      take: 5,
      include,
    }),
  ]);

  const counts = Object.fromEntries(countEntries) as Record<TrainerSessionTab, number>;
  return { ...result, counts, live };
}

export async function getTrainerWeek(userId: string, from: Date, to: Date) {
  const db = getDb();
  const [availability, bookings] = await Promise.all([
    db.trainerAvailability.findMany({
      where: { trainerId: userId, startAt: { lt: to }, endAt: { gt: from } },
      orderBy: { startAt: "asc" },
    }),
    db.booking.findMany({
      where: {
        trainerId: userId,
        startAt: { gte: from, lt: to },
        status: { in: ["CONFIRMED", "PENDING", "IN_PROGRESS"] },
      },
      orderBy: { startAt: "asc" },
      include: { customer: { include: { user: { select: { name: true } } } } },
    }),
  ]);
  return { availability, bookings };
}
