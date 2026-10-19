import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBooking } from "@/server/booking/booking-service";
import {
  completeSession,
  reconcileDueSessions,
  reconcileSession,
  startSession,
  syncSessionForTrainer,
} from "@/server/sessions/session-service";
import {
  TOMORROW,
  alice,
  arun,
  bela,
  createTestDb,
  ist,
  request,
  resetAndSeed,
  testDeps,
} from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

/** Books alice with arun at 10:00 IST tomorrow, then starts it with the given clock. */
async function bookFor(start = "10:00") {
  const res = await createBooking(
    testDeps(db),
    alice,
    request({ startAt: ist(TOMORROW, start).toISOString(), preferredTrainerId: arun.userId }),
  );
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

async function recordFor(bookingId: string) {
  return db.sessionRecord.findUniqueOrThrow({ where: { bookingId } });
}

describe("starting a session", () => {
  it("lets the assigned trainer start inside the window and persists server timestamps", async () => {
    const id = await bookFor();
    const started = await startSession(testDeps(db, ist(TOMORROW, "09:45")), arun, { bookingId: id });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data.status).toBe("IN_PROGRESS");
    expect(started.data.startedAt).toBe(ist(TOMORROW, "09:45").toISOString());
    expect(started.data.endsAt).toBe(ist(TOMORROW, "10:45").toISOString());
    expect(started.data.plannedMinutes).toBe(60);

    const row = await recordFor(id);
    expect(row.startedAt).toEqual(ist(TOMORROW, "09:45"));
    expect(row.endsAt).toEqual(ist(TOMORROW, "10:45"));
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("IN_PROGRESS");
    expect(
      await db.notification.count({ where: { bookingId: id, type: "SESSION_STARTED", recipientId: alice.userId } }),
    ).toBe(1);
  });

  it("refuses another trainer, and refuses outside the start window", async () => {
    const id = await bookFor();
    const foreign = await startSession(testDeps(db, ist(TOMORROW, "10:00")), bela, { bookingId: id });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND");

    const early = await startSession(testDeps(db, ist(TOMORROW, "09:44")), arun, { bookingId: id });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.message).toMatch(/15 minutes before/);

    const late = await startSession(testDeps(db, ist(TOMORROW, "10:31")), arun, { bookingId: id });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.message).toMatch(/window closed/);
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED");
  });

  it("repeated start requests never reset the start time or deadline", async () => {
    const id = await bookFor();
    const first = await startSession(testDeps(db, ist(TOMORROW, "09:45")), arun, { bookingId: id });
    const second = await startSession(testDeps(db, ist(TOMORROW, "10:10")), arun, { bookingId: id });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.alreadyDone).toBe(true);
    expect(second.data.startedAt).toBe(first.data.startedAt);
    expect(second.data.endsAt).toBe(first.data.endsAt);
    expect(await db.sessionRecord.count({ where: { bookingId: id } })).toBe(1);
  });

  it("refuses to start a booking that isn't confirmed", async () => {
    const id = await bookFor();
    const deps = testDeps(db, ist(TOMORROW, "10:00"));
    await startSession(deps, arun, { bookingId: id });
    const ended = await completeSession(testDeps(db, ist(TOMORROW, "10:56")), arun, { bookingId: id });
    expect(ended.ok).toBe(true);

    const again = await startSession(testDeps(db, ist(TOMORROW, "10:58")), arun, { bookingId: id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toMatch(/already completed/);
  });
});

describe("55-minute warning and 60-minute completion", () => {
  async function startedAt(clock = "09:45") {
    const id = await bookFor();
    const res = await startSession(testDeps(db, ist(TOMORROW, clock)), arun, { bookingId: id });
    if (!res.ok) throw new Error(res.error.message);
    return id;
  }

  it("sends the warning exactly once, even when reconciliation runs repeatedly", async () => {
    const id = await startedAt();
    const warnDeps = testDeps(db, ist(TOMORROW, "10:40")); // 55 minutes in
    const first = await reconcileSession(warnDeps, id);
    expect(first).toEqual({ warned: true, completed: false });

    const row = await recordFor(id);
    expect(row.warningSentAt).toEqual(ist(TOMORROW, "10:40"));
    expect(
      await db.notification.count({ where: { bookingId: id, type: "SESSION_WARNING" } }),
    ).toBe(2); // trainer + customer

    const second = await reconcileSession(testDeps(db, ist(TOMORROW, "10:41")), id);
    expect(second).toEqual({ warned: false, completed: false });
    expect(
      await db.notification.count({ where: { bookingId: id, type: "SESSION_WARNING" } }),
    ).toBe(2);
  });

  it("completes the session at its deadline with persisted timestamps, no browser involved", async () => {
    const id = await startedAt();
    const done = await reconcileSession(testDeps(db, ist(TOMORROW, "11:20")), id);
    expect(done).toEqual({ warned: false, completed: true });

    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(booking.status).toBe("COMPLETED");
    const row = await recordFor(id);
    expect(row.completedAt).toEqual(ist(TOMORROW, "10:45")); // the deadline, not the reconcile time
    expect(row.completionSource).toBe("DEADLINE");
    expect(
      await db.notification.count({ where: { bookingId: id, type: "SESSION_COMPLETED" } }),
    ).toBe(2);
  });

  it("repeated completion never duplicates records or notifications", async () => {
    const id = await startedAt();
    await reconcileSession(testDeps(db, ist(TOMORROW, "11:00")), id);
    const again = await reconcileSession(testDeps(db, ist(TOMORROW, "11:05")), id);
    expect(again).toEqual({ warned: false, completed: false });
    expect(
      await db.notification.count({ where: { bookingId: id, type: "SESSION_COMPLETED" } }),
    ).toBe(2);
    expect(await db.sessionRecord.count({ where: { bookingId: id } })).toBe(1);
  });

  it("lets the assigned trainer end the session from the 55-minute mark, but not earlier", async () => {
    const id = await startedAt();
    const tooEarly = await completeSession(testDeps(db, ist(TOMORROW, "10:39")), arun, { bookingId: id });
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.error.message).toMatch(/55-minute/);

    const ended = await completeSession(testDeps(db, ist(TOMORROW, "10:42")), arun, { bookingId: id });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    const row = await recordFor(id);
    expect(row.completedAt).toEqual(ist(TOMORROW, "10:42"));
    expect(row.completionSource).toBe("TRAINER");

    // A completed session can never go back to running.
    const restart = await startSession(testDeps(db, ist(TOMORROW, "10:50")), arun, { bookingId: id });
    expect(restart.ok).toBe(false);
  });

  it("another trainer cannot end the session, and the trainer cannot end someone else's", async () => {
    const id = await startedAt();
    const foreign = await completeSession(testDeps(db, ist(TOMORROW, "10:42")), bela, { bookingId: id });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND");
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("IN_PROGRESS");
  });

  it("rejects invalid transitions: completing a confirmed booking, starting a failed one", async () => {
    const id = await bookFor();
    const complete = await completeSession(testDeps(db, ist(TOMORROW, "10:00")), arun, { bookingId: id });
    expect(complete.ok).toBe(false);
    if (!complete.ok) expect(complete.error.message).toMatch(/in progress/);

    await db.booking.update({ where: { id }, data: { status: "FAILED" } });
    const start = await startSession(testDeps(db, ist(TOMORROW, "10:00")), arun, { bookingId: id });
    expect(start.ok).toBe(false);
    if (!start.ok) expect(start.error.message).toMatch(/can't be started/);
  });

  it("a refresh (sync) reports the persisted timing, never a restarted countdown", async () => {
    const id = await startedAt();
    const later = testDeps(db, ist(TOMORROW, "10:25"));
    const sync = await syncSessionForTrainer(later, arun, { bookingId: id });
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;
    expect(sync.data.startedAt).toBe(ist(TOMORROW, "09:45").toISOString());
    expect(sync.data.endsAt).toBe(ist(TOMORROW, "10:45").toISOString());
    expect(sync.data.changed).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("IN_PROGRESS");

    const foreign = await syncSessionForTrainer(later, bela, { bookingId: id });
    expect(foreign.ok).toBe(false);
  });

  it("reconcileDueSessions finds due sessions and processes them once", async () => {
    const id = await startedAt();
    const late = testDeps(db, ist(TOMORROW, "10:41")); // warning due (endsAt <= now + 5 min)
    const counts = await reconcileDueSessions(late, { trainerId: arun.userId });
    expect(counts.checked).toBeGreaterThanOrEqual(1);
    expect(counts.warned).toBe(1);
    expect(counts.completed).toBe(0);

    const again = await reconcileDueSessions(testDeps(db, ist(TOMORROW, "10:42")), {
      trainerId: arun.userId,
    });
    expect(again.warned).toBe(0);

    const overdue = await reconcileDueSessions(testDeps(db, ist(TOMORROW, "11:30")), {
      trainerId: arun.userId,
    });
    expect(overdue.completed).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
    expect((await recordFor(id)).completionSource).toBe("DEADLINE");
  });
});
