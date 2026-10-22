import "server-only";
import type { Prisma } from "@prisma/client";
import { WORKOUT_CATEGORIES, WORKOUT_CATEGORY_INFO } from "@/lib/booking/categories";
import { PAGE_SIZES, paginateRows } from "@/lib/pagination";
import { ACTIVE_BOOKING_STATUSES as ACTIVE_STATUSES } from "@/lib/booking/rules";
import { getDb } from "@/lib/db";
import { loadCustomerContext } from "@/server/booking/availability-service";
import { withTrip } from "@/server/location/trip";

/** What the booking wizard needs up front: the customer's community and which workouts it offers. */
export async function getBookingSetup(userId: string) {
  const db = getDb();
  const customer = await loadCustomerContext(db, userId);
  if (!customer) return null;
  const trainers = await db.trainerProfile.findMany({
    where: { serviceZoneId: customer.serviceZoneId, isActive: true, user: { status: "ACTIVE" } },
    select: { workoutCategories: true },
  });
  const categories = WORKOUT_CATEGORIES.map((value) => ({
    value,
    ...WORKOUT_CATEGORY_INFO[value],
    trainerCount: trainers.filter((t) => t.workoutCategories.includes(value)).length,
  }));
  return { customer, categories };
}

/** Everything a customer's booking list shows: coverage, payment state and session timing. */
export const customerBookingInclude = {
  trainer: {
    select: {
      userId: true,
      specializations: true,
      baseLatitude: true,
      baseLongitude: true,
      user: { select: { name: true } },
    },
  },
  serviceZone: { select: { name: true, latitude: true, longitude: true } },
  package: { select: { name: true } },
  payments: { orderBy: { createdAt: "desc" as const }, select: { status: true, amount: true } },
  packageEntries: { select: { reason: true } },
  sessionRecord: { select: { startedAt: true, endsAt: true, completedAt: true, completionSource: true } },
};

export async function getCustomerHome(userId: string, now = new Date()) {
  const db = getDb();
  const activityCutoff = new Date(now.getTime() - 8 * 7 * 86_400_000);
  const [profile, upcoming, recent, pkg, unread, activity, bookingCount, completedCount] = await Promise.all([
    db.customerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true } },
        serviceZone: { select: { name: true, timezone: true } },
      },
    }),
    db.booking
      .findMany({
        where: { customerId: userId, status: { in: [...ACTIVE_STATUSES] }, endAt: { gte: now } },
        orderBy: { startAt: "asc" },
        take: 3,
        include: customerBookingInclude,
      })
      // Trip derived here; the trainer's coordinates are dropped before the page sees the rows.
      .then((rows) => rows.map(withTrip)),
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
    db.booking.findMany({
      where: { customerId: userId, status: "COMPLETED", endAt: { gte: activityCutoff } },
      orderBy: { endAt: "desc" },
      select: { endAt: true },
    }),
    db.booking.count({ where: { customerId: userId } }),
    db.booking.count({ where: { customerId: userId, status: "COMPLETED" } }),
  ]);
  return {
    profile,
    upcoming,
    recent,
    pkg,
    unread,
    activityDates: activity.map((a) => a.endAt),
    bookingCount,
    completedCount,
  };
}

export const CUSTOMER_BOOKING_TABS = ["upcoming", "completed", "cancelled", "other"] as const;
export type CustomerBookingTab = (typeof CUSTOMER_BOOKING_TABS)[number];

/** Statuses that still occupy the calendar; IN_PROGRESS rows are pinned as "live" instead. */
const SCHEDULED_STATUSES = ["PENDING", "CONFIRMED"] as const;

function customerTabWhere(tab: CustomerBookingTab, userId: string, now: Date): Prisma.BookingWhereInput {
  switch (tab) {
    case "upcoming":
      return { customerId: userId, status: { in: [...SCHEDULED_STATUSES] }, endAt: { gte: now } };
    case "completed":
      return { customerId: userId, status: "COMPLETED" };
    case "cancelled":
      return { customerId: userId, status: "CANCELLED" };
    case "other":
      // Declined payments, plus scheduled bookings whose window closed without starting.
      return {
        customerId: userId,
        OR: [{ status: "FAILED" }, { status: { in: [...SCHEDULED_STATUSES] }, endAt: { lt: now } }],
      };
  }
}

/**
 * One tab at a time, newest first for history and soonest first for upcoming. Counts are exact per
 * tab, and in-progress sessions are pinned above the list so they can never be pushed off-page.
 */
export async function getCustomerBookings(
  userId: string,
  tab: CustomerBookingTab = "upcoming",
  page = 1,
  now: Date = new Date(),
  db = getDb(),
) {
  const [result, countEntries, live] = await Promise.all([
    paginateRows({
      page,
      pageSize: PAGE_SIZES.customerBookings,
      count: () => db.booking.count({ where: customerTabWhere(tab, userId, now) }),
      rows: (skip, take) =>
        db.booking
          .findMany({
            where: customerTabWhere(tab, userId, now),
            orderBy: [{ startAt: tab === "upcoming" ? "asc" : "desc" }, { id: "desc" }],
            skip,
            take,
            include: customerBookingInclude,
          })
          .then((rows) => rows.map(withTrip)),
    }),
    Promise.all(
      CUSTOMER_BOOKING_TABS.map(
        async (each) =>
          [each, await db.booking.count({ where: customerTabWhere(each, userId, now) })] as const,
      ),
    ),
    db.booking
      .findMany({
        where: { customerId: userId, status: "IN_PROGRESS" },
        orderBy: [{ startAt: "desc" }, { id: "desc" }],
        take: 5,
        include: customerBookingInclude,
      })
      .then((rows) => rows.map(withTrip)),
  ]);

  const counts = Object.fromEntries(countEntries) as Record<CustomerBookingTab, number>;
  return { ...result, counts, live };
}
