import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { exclusionConstraint } from "@/server/booking/errors";
import { createBooking } from "@/server/booking/booking-service";
import {
  TOMORROW,
  activeBookings,
  alice,
  arun,
  bob,
  createTestDb,
  crowd,
  ist,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();
const deps = testDeps(db);

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

describe("concurrent reservations", () => {
  it("lets exactly one of many simultaneous requests for one trainer and overlapping times succeed", async () => {
    // Eight different customers ask for Arun at 10:00 or 10:30 tomorrow at the same moment. Every pair
    // of those sessions overlaps, so at most one may exist.
    const results = await Promise.all(
      crowd.map((c, i) =>
        createBooking(
          deps,
          c,
          request({
            startAt: ist(TOMORROW, i % 2 === 0 ? "10:00" : "10:30").toISOString(),
            preferredTrainerId: arun.userId,
          }),
        ),
      ),
    );
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    for (const l of losers) if (!l.ok) expect(l.error.code).toBe("SLOT_TAKEN");

    const rows = await activeBookings(db, arun.userId);
    expect(rows).toHaveLength(1);
    expect(await db.notification.count({ where: { recipientId: arun.userId } })).toBe(1);
  });

  it("spreads simultaneous auto-assigned requests across free trainers without overlap", async () => {
    // Mobility at 10:00: two eligible trainers, three customers at once → two bookings, one refusal.
    const results = await Promise.all(
      crowd.slice(0, 3).map((c) => createBooking(deps, c, request({ workoutCategory: "MOBILITY" }))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const trainers = results.flatMap((r) => (r.ok ? [r.data.trainerName] : []));
    expect(new Set(trainers).size).toBe(2);
  });

  it("is enforced by Postgres itself: overlapping inserts that bypass the service still fail", async () => {
    const row = (customerId: string, start: string, reference: string) => ({
      reference,
      customerId,
      trainerId: arun.userId,
      serviceZoneId: "it_zone_main",
      mode: "SCHEDULED" as const,
      status: "CONFIRMED" as const,
      startAt: ist(TOMORROW, start),
      endAt: new Date(ist(TOMORROW, start).getTime() + 3_600_000),
      workoutCategory: "STRENGTH" as const,
      pricingRuleId: "it_normal",
      isPeak: false,
      sessionPrice: "399.00",
      commissionPercent: "10.00",
      commissionAmount: "39.90",
      totalAmount: "438.90",
    });
    const settled = await Promise.allSettled([
      db.booking.create({ data: row(alice.userId, "10:00", "ZY-RAW01") }),
      db.booking.create({ data: row(bob.userId, "10:30", "ZY-RAW02") }),
    ]);
    const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(exclusionConstraint(rejected[0]!.reason)).toBe("Booking_trainer_no_overlap");

    // Same customer, no trainer, overlapping one of their own sessions: the customer constraint fires.
    await db.booking.create({ data: row(alice.userId, "16:00", "ZY-RAW03") });
    const customerClash = await db.booking
      .create({ data: { ...row(alice.userId, "16:30", "ZY-RAW04"), trainerId: null } })
      .catch((e: unknown) => e);
    expect(exclusionConstraint(customerClash)).toBe("Booking_customer_no_overlap");

    // Cancelling frees the range at the database level too.
    await db.booking.updateMany({ where: { trainerId: arun.userId }, data: { status: "CANCELLED" } });
    await expect(db.booking.create({ data: row(bob.userId, "10:30", "ZY-RAW05") })).resolves.toBeTruthy();
  });
});
