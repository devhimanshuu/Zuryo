import "server-only";
import { WORKOUT_CATEGORIES, WORKOUT_CATEGORY_INFO } from "@/lib/booking/categories";
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
  const [profile, upcoming, recent, pkg, unread] = await Promise.all([
    db.customerProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true } }, serviceZone: { select: { name: true } } },
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
  ]);
  return { profile, upcoming, recent, pkg, unread };
}

export async function getCustomerBookings(userId: string) {
  // Latest-first with a generous cap: the list is a demo-scale history view, not an archive.
  // True pagination is a later product decision; the cap keeps the query bounded as data grows.
  return getDb()
    .booking.findMany({
      where: { customerId: userId },
      orderBy: { startAt: "desc" },
      take: 200,
      include: customerBookingInclude,
    })
    .then((rows) => rows.map(withTrip));
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
