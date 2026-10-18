import "server-only";
import { getDb } from "@/lib/db";

export async function getOperationsOverview() {
  const db = getDb();
  const [byStatus, unassigned, recent, trainers] = await Promise.all([
    db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    db.booking.findMany({
      where: { trainerId: null, status: "PENDING" },
      orderBy: { startAt: "asc" },
      include: {
        customer: { include: { user: { select: { name: true } } } },
        serviceZone: { select: { name: true } },
      },
    }),
    db.booking.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { customer: { include: { user: { select: { name: true } } } } },
    }),
    db.trainerProfile.count({ where: { isActive: true } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<
    Record<string, number>
  >;
  return { counts, unassigned, recent, activeTrainers: trainers };
}

export async function getOperationsBookings() {
  return getDb().booking.findMany({
    orderBy: { startAt: "desc" },
    include: {
      customer: { include: { user: { select: { name: true } } } },
      trainer: { include: { user: { select: { name: true } } } },
      serviceZone: { select: { name: true } },
    },
  });
}

export async function getOperationsTrainers(now = new Date()) {
  return getDb().trainerProfile.findMany({
    orderBy: { user: { name: "asc" } },
    include: {
      user: { select: { name: true, email: true } },
      serviceZone: { select: { name: true } },
      _count: {
        select: { bookings: { where: { startAt: { gte: now }, status: { in: ["CONFIRMED", "PENDING"] } } } },
      },
    },
  });
}

export async function getActivePricing() {
  return getDb().pricingRule.findMany({
    where: { isActive: true },
    orderBy: { kind: "asc" },
    include: { peakWindows: { orderBy: { startMinute: "asc" } } },
  });
}
