import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runAction } from "@/server/actions/run";
import { createBooking, getBookingForActor } from "@/server/booking/booking-service";
import { getInstantOffer, getMatches } from "@/server/booking/matching-service";
import { loadCustomerContext } from "@/server/booking/availability-service";
import {
  NOW,
  TODAY,
  TOMORROW,
  activeBookings,
  alice,
  arun,
  bela,
  bob,
  cara,
  createTestDb,
  idle,
  ist,
  ops,
  request,
  resetAndSeed,
  testDeps,
  zed,
} from "./helpers";

const db = createTestDb();
const deps = testDeps(db);

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

describe("creating a scheduled booking", () => {
  it("succeeds and persists the assignment, notes and server-computed price snapshot", async () => {
    const res = await createBooking(deps, alice, request({ notes: "  I have a 10 kg kettlebell  " }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ trainerName: arun.name, totalAmount: "438.90", replayed: false });
    expect(res.data.reference).toMatch(/^ZY-[A-Z2-9]{5}$/);

    const row = await db.booking.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(row).toMatchObject({
      customerId: alice.userId,
      trainerId: arun.userId,
      serviceZoneId: "it_zone_main",
      status: "CONFIRMED",
      mode: "SCHEDULED",
      workoutCategory: "STRENGTH",
      customerNotes: "I have a 10 kg kettlebell",
      isPeak: false,
      pricingRuleId: "it_normal",
    });
    expect(row.startAt).toEqual(ist(TOMORROW, "10:00"));
    expect(row.endAt).toEqual(ist(TOMORROW, "11:00"));
    expect([row.sessionPrice, row.commissionAmount, row.totalAmount].map(String)).toEqual([
      "399",
      "39.9",
      "438.9",
    ]);

    const notes = await db.notification.findMany({
      where: { bookingId: row.id },
      orderBy: { recipientId: "asc" },
    });
    expect(notes.map((n) => n.recipientId).sort()).toEqual([alice.userId, arun.userId].sort());
  });

  it("applies peak pricing only when the slot starts inside a peak window", async () => {
    const peak = await createBooking(deps, alice, request({ startAt: ist(TOMORROW, "07:00").toISOString() }));
    const edge = await createBooking(deps, bob, request({ startAt: ist(TOMORROW, "09:00").toISOString() }));
    expect(peak.ok && edge.ok).toBe(true);
    if (!peak.ok || !edge.ok) return;
    const [p, e] = await Promise.all([
      db.booking.findUniqueOrThrow({ where: { id: peak.data.id } }),
      db.booking.findUniqueOrThrow({ where: { id: edge.data.id } }),
    ]);
    expect([p.isPeak, p.pricingRuleId, String(p.totalAmount)]).toEqual([true, "it_peak", "548.9"]);
    expect([e.isPeak, e.pricingRuleId, String(e.totalAmount)]).toEqual([false, "it_normal", "438.9"]);
  });

  it("calculates the price on the server: client totals are refused or only used as a guard", async () => {
    const injected = await createBooking(deps, alice, { ...request(), totalAmount: "1.00" });
    expect(injected.ok).toBe(false);
    if (!injected.ok) expect(injected.error.code).toBe("VALIDATION");

    const stale = await createBooking(deps, alice, request({ expectedTotal: "1.00" }));
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.code).toBe("PRICE_CHANGED");
      expect(stale.error.quote?.totalAmount).toBe("438.90");
    }
    expect(await db.booking.count()).toBe(0);

    const agreed = await createBooking(deps, alice, request({ expectedTotal: "438.90" }));
    expect(agreed.ok).toBe(true);
  });

  it("rejects a past time slot", async () => {
    const res = await createBooking(deps, alice, request({ startAt: ist(TODAY, "08:00").toISOString() }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION");
      expect(res.error.fieldErrors?.startAt?.[0]).toMatch(/passed/);
    }
    expect(await db.booking.count()).toBe(0);
  });

  it("rejects an invalid workout category or a malformed request", async () => {
    for (const bad of [
      request({ workoutCategory: "PILATES" }),
      request({ startAt: "tomorrow at ten" }),
      request({ idempotencyKey: "not-a-uuid" }),
      { mode: "SCHEDULED" },
      null,
      "DROP TABLE",
    ]) {
      const res = await createBooking(deps, alice, bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("VALIDATION");
    }
    expect(await db.booking.count()).toBe(0);
  });

  it("rejects a trainer with no availability for the requested time", async () => {
    // Arun has 06:00–12:00 and 16:00–21:00 tomorrow; 13:00 falls in the gap.
    const chosen = await createBooking(
      deps,
      alice,
      request({ startAt: ist(TOMORROW, "13:00").toISOString(), preferredTrainerId: arun.userId }),
    );
    expect(chosen.ok).toBe(false);
    if (!chosen.ok) {
      expect(chosen.error.code).toBe("NO_TRAINER");
      expect(chosen.error.message).toMatch(/availability/);
      expect(chosen.error.alternatives?.length).toBeGreaterThan(0);
    }
    const auto = await createBooking(deps, alice, request({ startAt: ist(TOMORROW, "13:00").toISOString() }));
    expect(auto.ok).toBe(false);
    if (!auto.ok) expect(auto.error.code).toBe("NO_TRAINER");
    expect(await db.booking.count()).toBe(0);
  });

  it("never matches inactive trainers or trainers from another community", async () => {
    for (const trainerId of [idle, zed]) {
      const res = await createBooking(deps, alice, request({ preferredTrainerId: trainerId }));
      expect(res.ok, trainerId).toBe(false);
    }
    const customer = (await loadCustomerContext(db, alice.userId))!;
    const matches = await getMatches(deps, customer, {
      category: "STRENGTH",
      startAt: ist(TOMORROW, "08:00"),
      mode: "SCHEDULED",
    });
    expect(matches.ok && matches.data.trainers.map((t) => t.trainerId)).toEqual([arun.userId]);
  });

  it("rejects an overlapping booking for the same trainer, not just an identical start", async () => {
    expect((await createBooking(deps, alice, request())).ok).toBe(true); // 10:00–11:00
    for (const start of ["10:00", "10:30", "09:30"]) {
      const res = await createBooking(
        deps,
        bob,
        request({ startAt: ist(TOMORROW, start).toISOString(), preferredTrainerId: arun.userId }),
      );
      expect(res.ok, start).toBe(false);
      if (!res.ok) expect(res.error.code, start).toBe("SLOT_TAKEN");
    }
    // Back-to-back is fine: ranges are half-open.
    const next = await createBooking(deps, bob, request({ startAt: ist(TOMORROW, "11:00").toISOString() }));
    expect(next.ok).toBe(true);
    expect(await activeBookings(db, arun.userId)).toHaveLength(2);
  });

  it("stops a customer double-booking themselves with a different trainer", async () => {
    expect((await createBooking(deps, alice, request())).ok).toBe(true); // STRENGTH with Arun at 10:00
    const res = await createBooking(
      deps,
      alice,
      request({ workoutCategory: "YOGA", startAt: ist(TOMORROW, "10:30").toISOString() }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFLICT");
  });

  it("assigns the best-ranked trainer and moves to the next one as slots fill", async () => {
    // Mobility: Bela lists it first (primary focus), Arun second.
    const first = await createBooking(deps, alice, request({ workoutCategory: "MOBILITY" }));
    const second = await createBooking(deps, bob, request({ workoutCategory: "MOBILITY" }));
    const third = await createBooking(deps, cara, request({ workoutCategory: "MOBILITY" }));
    expect(first.ok && first.data.trainerName).toBe(bela.name);
    expect(second.ok && second.data.trainerName).toBe(arun.name);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error.code).toBe("NO_TRAINER");
  });

  it("returns the same booking when a request is retried with the same idempotency key", async () => {
    const body = request();
    const [a, b] = await Promise.all([createBooking(deps, alice, body), createBooking(deps, alice, body)]);
    const again = await createBooking(deps, alice, body);
    expect(a.ok && b.ok && again.ok).toBe(true);
    if (!a.ok || !b.ok || !again.ok) return;
    expect(new Set([a.data.id, b.data.id, again.data.id]).size).toBe(1);
    expect(again.data.replayed).toBe(true);
    expect(await db.booking.count()).toBe(1);

    const reused = await createBooking(deps, alice, {
      ...body,
      startAt: ist(TOMORROW, "16:00").toISOString(),
    });
    expect(reused.ok).toBe(false);
  });

  it("does not report success when the database fails mid-booking", async () => {
    const failing = testDeps(
      new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === "$transaction") {
            return async () => {
              throw new Error("Connection terminated unexpectedly");
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
    );
    const original = console.error;
    console.error = () => {};
    try {
      const res = await runAction("test", () => createBooking(failing, alice, request()));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("INTERNAL");
        expect(res.error.message).not.toMatch(/Connection terminated/);
      }
    } finally {
      console.error = original;
    }
    expect(await db.booking.count()).toBe(0);
  });

  it("refuses bookings from non-customer actors", async () => {
    const res = await createBooking(deps, arun, request());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("instant bookings", () => {
  it("offers the earliest eligible start within the hour and books it", async () => {
    const customer = (await loadCustomerContext(db, alice.userId))!;
    const offer = await getInstantOffer(deps, customer, "STRENGTH");
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    expect(offer.data.startAt).toBe(ist(TODAY, "10:30").toISOString()); // now is 10:00, 15-minute lead
    expect(offer.data.trainers[0]?.trainerId).toBe(arun.userId);

    const res = await createBooking(
      deps,
      alice,
      request({ mode: "INSTANT", startAt: offer.data.startAt, preferredTrainerId: arun.userId }),
    );
    expect(res.ok).toBe(true);
  });

  it("explains, with alternatives, when nobody can start within the hour", async () => {
    expect(
      (
        await createBooking(
          deps,
          alice,
          request({ mode: "INSTANT", startAt: ist(TODAY, "10:30").toISOString() }),
        )
      ).ok,
    ).toBe(true);
    const customer = (await loadCustomerContext(db, bob.userId))!;
    const offer = await getInstantOffer(deps, customer, "STRENGTH");
    expect(offer.ok).toBe(false);
    if (offer.ok) return;
    expect(offer.error.code).toBe("NO_TRAINER");
    expect(offer.error.message).toMatch(/within the next hour/);
    expect(offer.error.alternatives?.length).toBeGreaterThan(0);
    for (const a of offer.error.alternatives ?? [])
      expect(Date.parse(a.startAt)).toBeGreaterThan(NOW.getTime() + 3_600_000);
  });

  it("rejects an instant start outside the next hour", async () => {
    const res = await createBooking(
      deps,
      alice,
      request({ mode: "INSTANT", startAt: ist(TOMORROW, "10:00").toISOString() }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION");
  });
});

describe("reading bookings", () => {
  it("lets only the owning customer, the assigned trainer and operations see a booking", async () => {
    const res = await createBooking(deps, alice, request());
    if (!res.ok) throw new Error(res.error.message);
    const id = res.data.id;
    expect(await getBookingForActor(deps, alice, id)).not.toBeNull();
    expect(await getBookingForActor(deps, bob, id)).toBeNull();
    expect(await getBookingForActor(deps, arun, id)).not.toBeNull();
    expect(await getBookingForActor(deps, bela, id)).toBeNull();
    expect(await getBookingForActor(deps, ops, id)).not.toBeNull();
  });
});
