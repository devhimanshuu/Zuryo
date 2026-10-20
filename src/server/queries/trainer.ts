import "server-only";
import { getDb } from "@/lib/db";

const bookingInclude = {
  customer: { include: { user: { select: { name: true } } } },
  serviceZone: { select: { name: true } },
} as const;

export async function getTrainerOverview(userId: string, dayStart: Date, dayEnd: Date) {
  const db = getDb();
  const [profile, today, upcoming, notifications] = await Promise.all([
    db.trainerProfile.findUnique({ where: { userId }, include: { serviceZone: { select: { name: true } } } }),
    db.booking.findMany({
      where: {
        trainerId: userId,
        startAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ["CANCELLED", "FAILED"] },
      },
      orderBy: { startAt: "asc" },
      include: bookingInclude,
    }),
    db.booking.findMany({
      where: { trainerId: userId, startAt: { gte: dayEnd }, status: { in: ["CONFIRMED", "PENDING"] } },
      orderBy: { startAt: "asc" },
      take: 5,
      include: bookingInclude,
    }),
    db.notification.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return { profile, today, upcoming, notifications };
}

export async function getTrainerSessions(userId: string) {
  return getDb().booking.findMany({
    // Declined-payment bookings never became sessions, so trainers don't see them.
    where: { trainerId: userId, status: { not: "FAILED" } },
    orderBy: { startAt: "desc" },
    take: 200,
    include: {
      ...bookingInclude,
      sessionRecord: { select: { startedAt: true, endsAt: true, completedAt: true, completionSource: true } },
    },
  });
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
