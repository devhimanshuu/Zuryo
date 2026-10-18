import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelBooking, createBooking } from "@/server/booking/booking-service";
import {
  TOMORROW,
  alice,
  arun,
  bela,
  bob,
  createTestDb,
  ist,
  ops,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();
const deps = testDeps(db);

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

async function aliceBooking(start = "10:00") {
  const res = await createBooking(deps, alice, request({ startAt: ist(TOMORROW, start).toISOString() }));
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

describe("cancelling bookings", () => {
  it("lets a customer cancel their own booking and releases the slot", async () => {
    const id = await aliceBooking();
    const res = await cancelBooking(deps, alice, { bookingId: id, reason: "Travelling" });
    expect(res.ok).toBe(true);
    const row = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: "CANCELLED",
      cancelledById: alice.userId,
      cancellationReason: "Travelling",
    });
    expect(row.cancelledAt).not.toBeNull();

    // The cancelled booking no longer blocks the trainer: an overlapping slot books fine.
    const rebook = await createBooking(
      deps,
      bob,
      request({ startAt: ist(TOMORROW, "10:30").toISOString(), preferredTrainerId: arun.userId }),
    );
    expect(rebook.ok).toBe(true);
    expect(
      await db.notification.count({
        where: { bookingId: id, type: "BOOKING_CANCELLED", recipientId: arun.userId },
      }),
    ).toBe(1);
  });

  it("does not let a customer cancel (or discover) someone else's booking", async () => {
    const id = await aliceBooking();
    const res = await cancelBooking(deps, bob, { bookingId: id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED");
  });

  it("does not let a trainer cancel another trainer's booking", async () => {
    const id = await aliceBooking();
    const res = await cancelBooking(deps, bela, { bookingId: id, reason: "Not mine" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED");
  });

  it("lets the assigned trainer cancel, but only with a reason for the customer", async () => {
    const id = await aliceBooking();
    const noReason = await cancelBooking(deps, arun, { bookingId: id });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error.code).toBe("VALIDATION");
    const res = await cancelBooking(deps, arun, { bookingId: id, reason: "Unwell" });
    expect(res.ok).toBe(true);
    expect(
      await db.notification.count({
        where: { bookingId: id, type: "BOOKING_CANCELLED", recipientId: alice.userId },
      }),
    ).toBe(1);
  });

  it("lets operations cancel any booking", async () => {
    const id = await aliceBooking();
    expect((await cancelBooking(deps, ops, { bookingId: id, reason: "Facility closed" })).ok).toBe(true);
  });

  it("refuses to cancel an already cancelled booking", async () => {
    const id = await aliceBooking();
    expect((await cancelBooking(deps, alice, { bookingId: id })).ok).toBe(true);
    const again = await cancelBooking(deps, alice, { bookingId: id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toMatch(/already cancelled/);
  });

  it("refuses to cancel completed or already-started sessions", async () => {
    const id = await aliceBooking();
    await db.booking.update({ where: { id }, data: { status: "COMPLETED" } });
    const completed = await cancelBooking(deps, alice, { bookingId: id });
    expect(completed.ok).toBe(false);
    if (!completed.ok) expect(completed.error.message).toMatch(/Completed/);

    const later = await aliceBooking("16:00");
    const afterStart = testDeps(db, ist(TOMORROW, "16:10"));
    const started = await cancelBooking(afterStart, alice, { bookingId: later });
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.error.message).toMatch(/already started/);
  });

  it("lets only one of two simultaneous cancellations win", async () => {
    const id = await aliceBooking();
    const results = await Promise.all([
      cancelBooking(deps, alice, { bookingId: id }),
      cancelBooking(deps, ops, { bookingId: id, reason: "Duplicate" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await db.notification.count({ where: { bookingId: id, type: "BOOKING_CANCELLED" } }),
    ).toBeLessThanOrEqual(2);
  });
});
