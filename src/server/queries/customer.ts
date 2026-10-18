import "server-only";
import { getDb } from "@/lib/db";

const ACTIVE_STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS"] as const;

export async function getCustomerHome(userId: string, now = new Date()) {
  const db = getDb();
  const [profile, upcoming, recent, pkg, unread] = await Promise.all([
    db.customerProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true } }, serviceZone: { select: { name: true } } },
    }),
    db.booking.findMany({
      where: { customerId: userId, status: { in: [...ACTIVE_STATUSES] }, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 3,
      include: {
        trainer: { include: { user: { select: { name: true } } } },
        serviceZone: { select: { name: true } },
      },
    }),
    db.booking.findMany({
      where: { customerId: userId, status: "COMPLETED" },
      orderBy: { startAt: "desc" },
      take: 3,
      include: { trainer: { include: { user: { select: { name: true } } } }, sessionRecord: true },
    }),
    db.package.findFirst({
      where: { customerId: userId, status: "ACTIVE" },
      orderBy: { purchasedAt: "desc" },
    }),
    db.notification.count({ where: { recipientId: userId, readAt: null } }),
  ]);
  return { profile, upcoming, recent, pkg, unread };
}

export async function getCustomerBookings(userId: string) {
  return getDb().booking.findMany({
    where: { customerId: userId },
    orderBy: { startAt: "desc" },
    include: {
      trainer: { include: { user: { select: { name: true } } } },
      serviceZone: { select: { name: true } },
    },
  });
}

export async function getCustomerFitness(userId: string) {
  const db = getDb();
  const [profile, sessions] = await Promise.all([
    db.customerProfile.findUnique({ where: { userId } }),
    db.sessionRecord.findMany({
      where: { booking: { customerId: userId }, completedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      include: { booking: { include: { trainer: { include: { user: { select: { name: true } } } } } } },
    }),
  ]);
  return { profile, sessions };
}
