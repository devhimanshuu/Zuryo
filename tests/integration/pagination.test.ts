import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PAGE_SIZES } from "@/lib/pagination";
import { getPricingAdminView } from "@/server/booking/pricing-service";
import { listNotifications } from "@/server/notifications/notification-service";
import { getCustomerPackages } from "@/server/packages/package-service";
import { getCustomerBookings } from "@/server/queries/customer";
import { getOperationsBookings } from "@/server/queries/operations";
import { getTrainerSessions } from "@/server/queries/trainer";
import { NOW, ZONE, alice, arun, bob, createTestDb, resetAndSeed } from "./helpers";

const db = createTestDb();
beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

const DAY = 86_400_000;

function bookingData(
  customerId: string,
  trainerId: string,
  reference: string,
  startAt: Date,
  status: "COMPLETED" | "CONFIRMED" | "IN_PROGRESS",
) {
  return {
    reference,
    customerId,
    trainerId,
    serviceZoneId: ZONE,
    mode: "SCHEDULED" as const,
    status,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60_000),
    workoutCategory: "STRENGTH" as const,
    pricingRuleId: "it_normal",
    isPeak: false,
    sessionPrice: "399.00",
    commissionPercent: "10.00",
    commissionAmount: "39.90",
    totalAmount: "438.90",
  };
}

describe("list pagination", () => {
  it("pages a customer's completed history with exact totals and clamps stale pages", async () => {
    await db.booking.createMany({
      data: Array.from({ length: 21 }, (_, i) =>
        bookingData(
          alice.userId,
          arun.userId,
          `ITP-C-${String(i).padStart(2, "0")}`,
          new Date(NOW.getTime() - (i + 1) * DAY),
          "COMPLETED",
        ),
      ),
    });

    const first = await getCustomerBookings(alice.userId, "completed", 1, NOW, db);
    expect(first).toMatchObject({
      total: 21,
      totalPages: 3,
      from: 1,
      to: PAGE_SIZES.customerBookings,
      counts: { completed: 21, upcoming: 0, cancelled: 0, other: 0 },
    });
    expect(first.rows).toHaveLength(PAGE_SIZES.customerBookings);
    expect(first.rows[0]?.reference).toBe("ITP-C-00");
    expect(first.live).toHaveLength(0);

    const last = await getCustomerBookings(alice.userId, "completed", 99, NOW, db);
    expect(last).toMatchObject({ page: 3, from: 17, to: 21, hasNext: false });
    expect(last.rows).toHaveLength(5);
  });

  it("keeps in-progress sessions out of the page and pins them above the tabs", async () => {
    await db.booking.createMany({
      data: [
        ...Array.from({ length: 9 }, (_, i) =>
          bookingData(
            alice.userId,
            arun.userId,
            `ITP-U-${String(i).padStart(2, "0")}`,
            new Date(NOW.getTime() + (i + 1) * DAY),
            "CONFIRMED",
          ),
        ),
        bookingData(
          alice.userId,
          arun.userId,
          "ITP-LIVE",
          new Date(NOW.getTime() - 10 * 60_000),
          "IN_PROGRESS",
        ),
      ],
    });

    const page = await getCustomerBookings(alice.userId, "upcoming", 1, NOW, db);
    expect(page.counts.upcoming).toBe(9);
    expect(page.total).toBe(9);
    expect(page.rows[0]?.reference).toBe("ITP-U-00");
    expect(page.rows.map((r) => r.reference)).not.toContain("ITP-LIVE");
    expect(page.live.map((r) => r.reference)).toEqual(["ITP-LIVE"]);

    const second = await getCustomerBookings(alice.userId, "upcoming", 2, NOW, db);
    expect(second.rows.map((r) => r.reference)).toEqual(["ITP-U-08"]);
  });

  it("pages a trainer's sessions across assigned customers only", async () => {
    await db.booking.createMany({
      data: [
        ...Array.from({ length: 9 }, (_, i) =>
          bookingData(
            alice.userId,
            arun.userId,
            `ITP-TA-${String(i).padStart(2, "0")}`,
            new Date(NOW.getTime() - (i + 1) * DAY),
            "COMPLETED",
          ),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          bookingData(
            bob.userId,
            arun.userId,
            `ITP-TB-${String(i).padStart(2, "0")}`,
            new Date(NOW.getTime() - (i + 10) * DAY),
            "COMPLETED",
          ),
        ),
      ],
    });

    const first = await getTrainerSessions(arun.userId, "completed", 1, NOW, db);
    expect(first).toMatchObject({ total: 12, totalPages: 2, counts: { completed: 12, upcoming: 0 } });
    expect(first.rows).toHaveLength(PAGE_SIZES.trainerSessions);

    const second = await getTrainerSessions(arun.userId, "completed", 2, NOW, db);
    expect(second.rows).toHaveLength(4);
  });

  it("pages operations bookings and packages newest first", async () => {
    await db.booking.createMany({
      data: Array.from({ length: 22 }, (_, i) =>
        bookingData(
          alice.userId,
          arun.userId,
          `ITP-O-${String(i).padStart(2, "0")}`,
          new Date(NOW.getTime() - (i + 1) * DAY),
          "COMPLETED",
        ),
      ),
    });
    await db.package.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        customerId: alice.userId,
        name: `Pack ${i}`,
        totalSessions: 5,
        pricePaid: "100.00",
        purchasedAt: new Date(NOW.getTime() - (i + 1) * DAY),
      })),
    });

    const bookings = await getOperationsBookings(2, db);
    expect(bookings).toMatchObject({ total: 22, totalPages: 2, page: 2 });
    expect(bookings.rows).toHaveLength(2);

    const packages = await getCustomerPackages(db, alice.userId, NOW, 2);
    expect(packages).toMatchObject({ total: 7, totalPages: 2, page: 2 });
    expect(packages.rows.map((p) => p.name)).toEqual(["Pack 6"]);
  });

  it("pages notifications per recipient without leaking between users", async () => {
    const notification = (userId: string, index: number) => ({
      recipientId: userId,
      type: "BOOKING_ASSIGNED" as const,
      title: `Update ${index}`,
      message: "Test notification",
      createdAt: new Date(NOW.getTime() - index * 60_000),
    });
    await db.notification.createMany({
      data: [
        ...Array.from({ length: 23 }, (_, i) => notification(alice.userId, i)),
        ...Array.from({ length: 3 }, (_, i) => notification(bob.userId, i)),
      ],
    });

    const first = await listNotifications(db, alice.userId, 1);
    expect(first).toMatchObject({ total: 23, totalPages: 2 });
    expect(first.rows).toHaveLength(PAGE_SIZES.notifications);
    expect(first.rows[0]?.title).toBe("Update 0");

    const second = await listNotifications(db, alice.userId, 2);
    expect(second.rows).toHaveLength(3);
    expect((await listNotifications(db, bob.userId, 1)).total).toBe(3);
  });

  it("keeps active pricing rules visible while paging version history", async () => {
    await db.pricingRule.createMany({
      data: Array.from({ length: 11 }, (_, i) => ({
        name: `Old standard ${i}`,
        kind: "NORMAL" as const,
        sessionPrice: "349.00",
        commissionPercent: "10.00",
        effectiveFrom: new Date(NOW.getTime() - (i + 1) * DAY),
        isActive: false,
      })),
    });

    const page = await getPricingAdminView(db, 2);
    expect(page.history).toMatchObject({ total: 13, totalPages: 2, page: 2 });
    expect(page.history.rows).toHaveLength(3);
    expect(page.standard?.id).toBe("it_normal");
    expect(page.peak?.id).toBe("it_peak");
  });
});
