import "server-only";
import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { PAGE_SIZES, paginateRows } from "@/lib/pagination";
import type { BookingSort, TrainerSort } from "@/lib/operations-filters";
import type { BookingStatus } from "@/lib/validation/enums";

const unassignedWhere = { trainerId: null, status: "PENDING" } as const;

export async function getOperationsOverview() {
  const db = getDb();
  const trendCutoff = new Date(Date.now() - 28 * 86_400_000);
  const [byStatus, unassigned, unassignedCount, recent, trainers, trendBookings, trendRevenue] =
    await Promise.all([
      db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
      db.booking.findMany({
        where: unassignedWhere,
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: 20,
        include: {
          customer: { include: { user: { select: { name: true } } } },
          serviceZone: { select: { name: true } },
        },
      }),
      db.booking.count({ where: unassignedWhere }),
      db.booking.findMany({
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: { customer: { include: { user: { select: { name: true } } } } },
      }),
      db.trainerProfile.count({ where: { isActive: true } }),
      db.booking.findMany({
        where: { createdAt: { gte: trendCutoff } },
        select: { createdAt: true },
      }),
      db.payment.findMany({
        where: { createdAt: { gte: trendCutoff }, status: "SUCCEEDED" },
        select: { createdAt: true, amount: true },
      }),
    ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<
    Record<string, number>
  >;
  return {
    counts,
    unassigned,
    unassignedCount,
    recent,
    activeTrainers: trainers,
    trendBookings: trendBookings.map((b) => b.createdAt),
    trendRevenue: trendRevenue.map((p) => ({ at: p.createdAt, amount: p.amount.toString() })),
  };
}

const operationsBookingInclude = {
  customer: { include: { user: { select: { name: true } } } },
  trainer: { include: { user: { select: { name: true } } } },
  serviceZone: { select: { name: true } },
  package: { select: { name: true } },
  payments: { orderBy: { createdAt: "desc" as const }, select: { status: true, amount: true } },
  packageEntries: { select: { reason: true } },
} as const;

type OperationsBookingFilters = { q?: string; status?: BookingStatus | null; sort?: BookingSort };

function operationsBookingWhere(filters: OperationsBookingFilters): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    where.OR = [
      { reference: { contains: filters.q, mode: "insensitive" } },
      { customer: { user: { name: { contains: filters.q, mode: "insensitive" } } } },
      { trainer: { user: { name: { contains: filters.q, mode: "insensitive" } } } },
      { serviceZone: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

function operationsBookingOrderBy(filters: OperationsBookingFilters): Prisma.BookingOrderByWithRelationInput[] {
  return filters.sort === "oldest"
    ? [{ startAt: "asc" }, { id: "asc" }]
    : filters.sort === "updated"
      ? [{ updatedAt: "desc" }, { id: "desc" }]
      : [{ startAt: "desc" }, { id: "desc" }];
}

/** Newest bookings first by default, one page at a time with an exact total for the header. */
export async function getOperationsBookings(
  page = 1,
  db = getDb(),
  filters: OperationsBookingFilters = {},
) {
  const where = operationsBookingWhere(filters);
  const orderBy = operationsBookingOrderBy(filters);
  return paginateRows({
    page,
    pageSize: PAGE_SIZES.operationsBookings,
    count: () => db.booking.count({ where }),
    rows: (skip, take) =>
      db.booking.findMany({
        where,
        orderBy,
        skip,
        take,
        include: operationsBookingInclude,
      }),
  });
}

/** All rows matching the current filters for a CSV download, capped so one request stays bounded. */
export async function getOperationsBookingsForExport(
  filters: OperationsBookingFilters = {},
  db = getDb(),
  limit = 5000,
) {
  return db.booking.findMany({
    where: operationsBookingWhere(filters),
    orderBy: operationsBookingOrderBy(filters),
    take: limit,
    include: operationsBookingInclude,
  });
}

export async function getOperationsTrainers(
  page = 1,
  now = new Date(),
  db = getDb(),
  filters: { q?: string; active?: boolean | null; sort?: TrainerSort } = {},
) {
  const where: Prisma.TrainerProfileWhereInput = {};
  if (filters.active === true || filters.active === false) where.isActive = filters.active;
  if (filters.q) {
    where.OR = [
      { user: { name: { contains: filters.q, mode: "insensitive" } } },
      { user: { email: { contains: filters.q, mode: "insensitive" } } },
      { serviceZone: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  const orderBy: Prisma.TrainerProfileOrderByWithRelationInput[] =
    filters.sort === "experience"
      ? [{ experienceYears: "desc" }, { user: { name: "asc" } }]
      : [{ user: { name: "asc" } }, { userId: "asc" }];
  return paginateRows({
    page,
    pageSize: PAGE_SIZES.operationsTrainers,
    count: () => db.trainerProfile.count({ where }),
    rows: (skip, take) =>
      db.trainerProfile.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          user: { select: { name: true, email: true } },
          serviceZone: { select: { name: true, latitude: true, longitude: true } },
          _count: {
            select: {
              bookings: { where: { startAt: { gte: now }, status: { in: ["CONFIRMED", "PENDING"] } } },
            },
          },
        },
      }),
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
