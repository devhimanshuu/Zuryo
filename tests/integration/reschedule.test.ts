import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_RESCHEDULES } from "@/lib/booking/rules";
import { cancelBooking, createBooking } from "@/server/booking/booking-service";
import { getRescheduleOptions, rescheduleBooking } from "@/server/booking/reschedule-service";
import { payForPackage, startPackageCheckout } from "@/server/packages/package-service";
import {
  PLANS,
  TOMORROW,
  alice,
  arun,
  bela,
  bob,
  createTestDb,
  ist,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

/*
 * The test world (see helpers.ts): tomorrow is a Tuesday. Arun coaches strength + mobility and is
 * free 06:00–12:00 and 16:00–21:00; Bela coaches mobility + yoga and is free 06:00–12:00. Weekday
 * peak pricing runs 06:00–09:00 and 17:00–20:00 (₹499 + 10%); other slots are standard (₹399 + 10%).
 */
const db = createTestDb();
const deps = testDeps(db);

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

async function book(customer = alice, start = "10:00", overrides: Record<string, unknown> = {}) {
  const res = await createBooking(
    deps,
    customer,
    request({ startAt: ist(TOMORROW, start).toISOString(), preferredTrainerId: arun.userId, ...overrides }),
  );
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

const move = (customer: typeof alice, bookingId: string, start: string) =>
  rescheduleBooking(deps, customer, { bookingId, startAt: ist(TOMORROW, start).toISOString() });

async function buyStarter() {
  const started = await startPackageCheckout(deps, alice, { planId: PLANS.starter, checkoutKey: randomUUID() });
  if (!started.ok) throw new Error(started.error.message);
  const paid = await payForPackage(deps, alice, {
    packageId: started.data.packageId,
    outcome: "SUCCEED",
    idempotencyKey: randomUUID(),
  });
  if (!paid.ok) throw new Error(paid.error.message);
  return started.data.packageId;
}

describe("rescheduling a paid booking", () => {
  it("moves it to a same-price slot with the same trainer, keeps the payment, and notifies both sides", async () => {
    const id = await book();
    const res = await move(alice, id, "11:00");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ trainerChanged: false, unchanged: false, startAt: ist(TOMORROW, "11:00").toISOString() });

    const row = await db.booking.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    expect(row).toMatchObject({ status: "CONFIRMED", trainerId: arun.userId, rescheduleCount: 1 });
    expect(row.startAt).toEqual(ist(TOMORROW, "11:00"));
    expect(row.endAt).toEqual(ist(TOMORROW, "12:00"));
    expect(row.lastRescheduledAt).not.toBeNull();
    // Same booking, same single payment, same amount: nothing charged or refunded by the move.
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0]).toMatchObject({ status: "SUCCEEDED" });
    expect(String(row.payments[0]!.amount)).toBe(String(row.totalAmount));
    expect(String(row.totalAmount)).toBe("438.9");

    const notes = await db.notification.findMany({ where: { bookingId: id, type: "BOOKING_RESCHEDULED" } });
    expect(notes.map((n) => n.recipientId).sort()).toEqual([alice.userId, arun.userId].sort());
  });

  it("refuses a slot at a different price and leaves the booking untouched", async () => {
    const id = await book(); // 10:00, standard
    const res = await move(alice, id, "17:00"); // weekday evening peak
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("PRICE_CHANGED");
      expect(res.error.message).toMatch(/₹548\.90.*₹438\.90/);
    }
    const row = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(row.startAt).toEqual(ist(TOMORROW, "10:00"));
    expect(row.rescheduleCount).toBe(0);
  });

  it("shows the customer which slots they can move to: own slot free, other prices marked", async () => {
    const id = await book();
    const res = await getRescheduleOptions(deps, alice, { bookingId: id });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.requiredTotal).toBe("438.90");
    expect(res.data.reschedulesLeft).toBe(MAX_RESCHEDULES);
    const slots = res.data.schedule.days.find((d) => d.dateKey === TOMORROW)!.slots;
    const at = (hhmm: string) => slots.find((s) => s.startAt === ist(TOMORROW, hhmm).toISOString())!;
    // Overlaps the booking's own current slot, which doesn't block its move.
    expect(at("10:30").status).toBe("AVAILABLE");
    expect(at("17:00").status).toBe("PRICE_DIFFERS");
    expect(at("13:00").status).toBe("UNAVAILABLE");
  });
});

describe("rescheduling rules and isolation", () => {
  it("hands the session to another eligible trainer when the current one is busy, notifying all three", async () => {
    const id = await book(alice, "10:00", { workoutCategory: "MOBILITY" });
    await book(bob, "11:00"); // Arun is now busy 11:00–12:00
    const res = await move(alice, id, "11:00");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.trainerChanged).toBe(true);
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).trainerId).toBe(bela.userId);
    const notes = await db.notification.findMany({ where: { bookingId: id, createdAt: { gte: new Date(0) } } });
    expect(notes.some((n) => n.recipientId === arun.userId && n.type === "BOOKING_RESCHEDULED")).toBe(true);
    expect(notes.some((n) => n.recipientId === bela.userId && n.type === "BOOKING_ASSIGNED")).toBe(true);
    expect(notes.some((n) => n.recipientId === alice.userId && n.type === "BOOKING_RESCHEDULED")).toBe(true);
  });

  it("reports no trainer when nobody eligible is free, without changing anything", async () => {
    const id = await book(); // strength: only Arun coaches it
    const res = await move(alice, id, "13:00"); // outside Arun's availability
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NO_TRAINER");
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).startAt).toEqual(ist(TOMORROW, "10:00"));
  });

  it("won't move onto the customer's own other session", async () => {
    await book(alice, "10:00");
    const evening = await book(alice, "16:00");
    const res = await move(alice, evening, "10:30");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFLICT");
  });

  it("doesn't let another customer move (or discover) the booking", async () => {
    const id = await book();
    const res = await move(bob, id, "11:00");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
    const trainerTry = await rescheduleBooking(deps, arun, { bookingId: id, startAt: ist(TOMORROW, "11:00").toISOString() });
    expect(trainerTry.ok).toBe(false);
    if (!trainerTry.ok) expect(trainerTry.error.code).toBe("FORBIDDEN");
  });

  it("treats a repeated move as a no-op and enforces the move limit", async () => {
    const id = await book();
    expect((await move(alice, id, "10:30")).ok).toBe(true);
    const repeat = await move(alice, id, "10:30");
    expect(repeat.ok && repeat.data.unchanged).toBe(true);
    expect(await db.notification.count({ where: { bookingId: id, type: "BOOKING_RESCHEDULED" } })).toBe(2);

    expect((await move(alice, id, "11:00")).ok).toBe(true);
    expect((await move(alice, id, "09:30")).ok).toBe(true);
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).rescheduleCount).toBe(MAX_RESCHEDULES);
    const over = await move(alice, id, "10:00");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe("CONFLICT");
  });

  it("refuses to move a cancelled booking", async () => {
    const id = await book();
    expect((await cancelBooking(deps, alice, { bookingId: id })).ok).toBe(true);
    const res = await move(alice, id, "11:00");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFLICT");
  });
});

describe("rescheduling a package booking", () => {
  it("moves to any slot, re-snapshots the price, and never debits the package twice", async () => {
    const pkg = await buyStarter();
    const id = await book(alice, "10:00", { payment: { method: "PACKAGE", packageId: pkg } });
    const res = await move(alice, id, "17:00"); // peak is fine: a package session covers any slot
    expect(res.ok).toBe(true);

    const row = await db.booking.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    expect(row.isPeak).toBe(true);
    expect(String(row.totalAmount)).toBe("548.9");
    expect(row.payments).toHaveLength(0);
    const entries = await db.packageLedgerEntry.findMany({ where: { packageId: pkg } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ bookingId: id, delta: -1, reason: "BOOKING_DEBIT" });
    expect((await db.package.findUniqueOrThrow({ where: { id: pkg } })).usedSessions).toBe(1);
  });
});

describe("concurrent rescheduling", () => {
  it("two customers moving into the same trainer slot at once: exactly one wins, no overlap is stored", async () => {
    const a = await book(alice, "09:00");
    const b = await book(bob, "11:00");
    const [ra, rb] = await Promise.all([move(alice, a, "10:00"), move(bob, b, "10:00")]);
    expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1);
    const loser = ra.ok ? rb : ra;
    if (!loser.ok) expect(["SLOT_TAKEN", "NO_TRAINER"]).toContain(loser.error.code);

    const active = await db.booking.findMany({
      where: { trainerId: arun.userId, status: "CONFIRMED" },
      orderBy: { startAt: "asc" },
    });
    for (let i = 1; i < active.length; i++) {
      expect(active[i]!.startAt.getTime()).toBeGreaterThanOrEqual(active[i - 1]!.endAt.getTime());
    }
    expect(active.filter((x) => x.startAt.getTime() === ist(TOMORROW, "10:00").getTime())).toHaveLength(1);
  });

  it("a move racing a new booking for the same slot: exactly one gets it", async () => {
    const a = await book(alice, "09:00");
    const [moved, created] = await Promise.all([
      move(alice, a, "10:00"),
      createBooking(deps, bob, request({ startAt: ist(TOMORROW, "10:00").toISOString(), preferredTrainerId: arun.userId })),
    ]);
    expect([moved.ok, created.ok].filter(Boolean)).toHaveLength(1);
    expect(
      await db.booking.count({
        where: { trainerId: arun.userId, status: "CONFIRMED", startAt: ist(TOMORROW, "10:00") },
      }),
    ).toBe(1);
  });
});
