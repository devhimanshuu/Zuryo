import "server-only";
import { getDb } from "@/lib/db";

export async function getOperationsOverview() {
  const db = getDb();
  const [byStatus, unassigned, recent, trainers] = await Promise.all([
    db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    db.booking.findMany({
      where: { trainerId: null, status: "PENDING" },
      orderBy: { startAt: "asc" },
      take: 20,
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
    take: 200,
    include: {
      customer: { include: { user: { select: { name: true } } } },
      trainer: { include: { user: { select: { name: true } } } },
      serviceZone: { select: { name: true } },
      package: { select: { name: true } },
      payments: { orderBy: { createdAt: "desc" }, select: { status: true, amount: true } },
      packageEntries: { select: { reason: true } },
    },
  });
}

export async function getOperationsTrainers(now = new Date()) {
  return getDb().trainerProfile.findMany({
    orderBy: { user: { name: "asc" } },
    take: 100,
    include: {
      user: { select: { name: true, email: true } },
      serviceZone: { select: { name: true, latitude: true, longitude: true } },
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

/**
 * Financial and package figures for the operations dashboard. Every number is an aggregate over
 * persisted Payment / Package rows (all simulated money), with the definition shown next to it in
 * the UI. Package-covered bookings have no payment of their own: their commission was counted once,
 * when the package was bought.
 */
export async function getOperationsFinance() {
  const db = getDb();
  const now = new Date();
  const [byStatus, succeeded, byTarget, packages, remaining, recent] = await Promise.all([
    db.payment.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
    db.payment.aggregate({
      where: { status: "SUCCEEDED" },
      _sum: { amount: true, baseAmount: true, commissionAmount: true },
    }),
    db.payment.groupBy({
      by: ["status"],
      where: { status: "SUCCEEDED", packageId: { not: null } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    db.package.groupBy({ by: ["status"], _count: { _all: true } }),
    db.package.findMany({
      where: { status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { totalSessions: true, usedSessions: true },
    }),
    db.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        booking: { select: { reference: true, customer: { select: { user: { select: { name: true } } } } } },
        package: { select: { name: true, customer: { select: { user: { select: { name: true } } } } } },
      },
    }),
  ]);
  const status = Object.fromEntries(
    byStatus.map((s) => [s.status, { count: s._count._all, amount: s._sum.amount?.toString() ?? "0.00" }]),
  ) as Partial<Record<"PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED", { count: number; amount: string }>>;
  const pkgStatus = Object.fromEntries(packages.map((p) => [p.status, p._count._all])) as Partial<
    Record<string, number>
  >;
  return {
    payments: status,
    succeeded: {
      total: succeeded._sum.amount?.toString() ?? "0.00",
      net: succeeded._sum.baseAmount?.toString() ?? "0.00",
      commission: succeeded._sum.commissionAmount?.toString() ?? "0.00",
      packageCount: byTarget[0]?._count._all ?? 0,
      packageAmount: byTarget[0]?._sum.amount?.toString() ?? "0.00",
    },
    packages: {
      active: pkgStatus.ACTIVE ?? 0,
      exhausted: pkgStatus.EXHAUSTED ?? 0,
      expired: pkgStatus.EXPIRED ?? 0,
      pendingPayment: pkgStatus.PENDING_PAYMENT ?? 0,
      sessionsRemaining: remaining.reduce((n, p) => n + Math.max(0, p.totalSessions - p.usedSessions), 0),
    },
    recent: recent.map((p) => ({
      id: p.id,
      status: p.status,
      amount: p.amount.toString(),
      commission: p.commissionAmount?.toString() ?? null,
      createdAt: p.createdAt,
      what: p.booking ? `Booking ${p.booking.reference}` : `Package · ${p.package?.name ?? "—"}`,
      customer: p.booking?.customer.user.name ?? p.package?.customer.user.name ?? "—",
    })),
  };
}
