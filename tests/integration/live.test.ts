import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelBooking, createBooking } from "@/server/booking/booking-service";
import { getLiveSnapshot } from "@/server/live/live-service";
import { startSession } from "@/server/sessions/session-service";
import {
  TOMORROW,
  alice,
  arun,
  bob,
  createTestDb,
  ist,
  ops,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

async function book(start = "10:00") {
  const res = await createBooking(
    testDeps(db),
    alice,
    request({ startAt: ist(TOMORROW, start).toISOString(), preferredTrainerId: arun.userId }),
  );
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

describe("live snapshot for open pages", () => {
  it("moves the customer's fingerprint when the trainer changes their booking", async () => {
    const id = await book();
    const before = await getLiveSnapshot(testDeps(db), alice);

    const cancelled = await cancelBooking(testDeps(db), arun, { bookingId: id, reason: "Unwell" });
    expect(cancelled.ok).toBe(true);

    const after = await getLiveSnapshot(testDeps(db), alice);
    expect(after.token).not.toBe(before.token);
    expect(after.reconciled).toBe(false);
  });

  it("is scoped to the actor: another customer's fingerprint doesn't move", async () => {
    const bobBefore = await getLiveSnapshot(testDeps(db), bob);
    await book();
    const bobAfter = await getLiveSnapshot(testDeps(db), bob);
    expect(bobAfter.token).toBe(bobBefore.token);
  });

  it("records the 55-minute warning and the 60-minute completion when either party's page polls", async () => {
    const id = await book();
    const started = await startSession(testDeps(db, ist(TOMORROW, "10:00")), arun, { bookingId: id });
    expect(started.ok).toBe(true);

    // The trainer's session screen is closed; only the customer's page is polling.
    const atWarning = await getLiveSnapshot(testDeps(db, ist(TOMORROW, "10:56")), alice);
    expect(atWarning.reconciled).toBe(true);
    const warned = await db.sessionRecord.findUniqueOrThrow({ where: { bookingId: id } });
    expect(warned.warningSentAt).toEqual(ist(TOMORROW, "10:56"));
    expect(warned.completedAt).toBeNull();

    // A repeat poll changes nothing.
    expect((await getLiveSnapshot(testDeps(db, ist(TOMORROW, "10:57")), alice)).reconciled).toBe(false);

    // A late poll by operations still records the true end time.
    const atEnd = await getLiveSnapshot(testDeps(db, ist(TOMORROW, "11:09")), ops);
    expect(atEnd.reconciled).toBe(true);
    const done = await db.sessionRecord.findUniqueOrThrow({ where: { bookingId: id } });
    expect(done.completedAt).toEqual(ist(TOMORROW, "11:00"));
    expect(done.completionSource).toBe("DEADLINE");
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
  });
});
