import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadCustomerContext } from "@/server/booking/availability-service";
import { createBooking, getBookingForActor } from "@/server/booking/booking-service";
import { getInstantOffer } from "@/server/booking/matching-service";
import {
  TODAY,
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

/** Puts a trainer's simulated base `km` due north of the test community (12.9, 77.6). */
async function placeTrainer(trainerId: string, km: number) {
  await db.trainerProfile.update({
    where: { userId: trainerId },
    data: { baseLatitude: (12.9 + km / 111.19).toFixed(6), baseLongitude: "77.600000" },
  });
}

describe("instant bookings and travel time", () => {
  // The clock is 10:00 IST; instant starts on offer are 10:30 and 11:00.
  it("offers the first start a distant trainer can actually reach", async () => {
    await placeTrainer(arun.userId, 9); // ~12.2 km by road, 39 min
    const customer = (await loadCustomerContext(db, alice.userId))!;
    const offer = await getInstantOffer(testDeps(db), customer, "STRENGTH");
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    expect(offer.data.startAt).toBe(ist(TODAY, "11:00").toISOString());
    expect(offer.data.trainers[0]?.travel?.travelMinutes).toBe(39);

    await placeTrainer(arun.userId, 2); // 13 min: the 10:30 start is reachable again
    const near = await getInstantOffer(testDeps(db), customer, "STRENGTH");
    expect(near.ok && near.data.startAt).toBe(ist(TODAY, "10:30").toISOString());
  });

  it("refuses to confirm an instant start the trainer can't reach, with the reason", async () => {
    await placeTrainer(arun.userId, 11); // 46 min
    const res = await createBooking(
      testDeps(db),
      alice,
      request({
        mode: "INSTANT",
        startAt: ist(TODAY, "10:30").toISOString(),
        preferredTrainerId: arun.userId,
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("NO_TRAINER");
      expect(res.error.message).toMatch(/can't reach your community in time/);
    }
    expect(await db.booking.count()).toBe(0);
  });

  it("still accepts an offer confirmed a few minutes later, within the review allowance", async () => {
    await placeTrainer(arun.userId, 2); // 13 min; offered at 10:00 for 10:30
    const res = await createBooking(
      testDeps(db, ist(TODAY, "10:20")),
      alice,
      request({
        mode: "INSTANT",
        startAt: ist(TODAY, "10:30").toISOString(),
        preferredTrainerId: arun.userId,
      }),
    );
    expect(res.ok).toBe(true);
  });
});

describe("automatic assignment by distance", () => {
  // Make both trainers primary for mobility, so only distance separates them.
  async function equallySuited() {
    await db.trainerProfile.update({
      where: { userId: arun.userId },
      data: { workoutCategories: ["MOBILITY", "STRENGTH"] },
    });
  }

  it("assigns the nearer of two equally suited trainers", async () => {
    await equallySuited();
    await placeTrainer(arun.userId, 1);
    await placeTrainer(bela.userId, 8);
    const res = await createBooking(
      testDeps(db),
      alice,
      request({ workoutCategory: "MOBILITY", startAt: ist(TOMORROW, "08:00").toISOString() }),
    );
    expect(res.ok && (await db.booking.findUniqueOrThrow({ where: { id: res.data.id } })).trainerId).toBe(
      arun.userId,
    );
  });

  it("follows the distance, not the trainer id, when they swap places", async () => {
    await equallySuited();
    await placeTrainer(arun.userId, 8);
    await placeTrainer(bela.userId, 1);
    const res = await createBooking(
      testDeps(db),
      alice,
      request({ workoutCategory: "MOBILITY", startAt: ist(TOMORROW, "08:00").toISOString() }),
    );
    expect(res.ok && (await db.booking.findUniqueOrThrow({ where: { id: res.data.id } })).trainerId).toBe(
      bela.userId,
    );
  });
});

describe("the customer's arrival estimate", () => {
  it("is derived from stored coordinates and exposes only distance and times", async () => {
    await placeTrainer(arun.userId, 2); // 2.7 km by road, 13 min
    const created = await createBooking(
      testDeps(db),
      alice,
      request({ startAt: ist(TOMORROW, "10:00").toISOString(), preferredTrainerId: arun.userId }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const booking = await getBookingForActor(testDeps(db), alice, created.data.id);
    expect(booking?.trainer).not.toHaveProperty("baseLatitude");
    expect(booking?.trainer).not.toHaveProperty("baseLongitude");
    expect(booking?.trip).toEqual({
      roadKm: 2.7,
      travelMinutes: 13,
      departAt: ist(TOMORROW, "09:42").toISOString(),
      arriveBy: ist(TOMORROW, "09:55").toISOString(),
    });
  });

  it("is absent for a trainer without a location", async () => {
    const created = await createBooking(
      testDeps(db),
      alice,
      request({ startAt: ist(TOMORROW, "10:00").toISOString(), preferredTrainerId: arun.userId }),
    );
    if (!created.ok) throw new Error(created.error.message);
    expect((await getBookingForActor(testDeps(db), alice, created.data.id))?.trip).toBeNull();
  });
});

describe("stored trainer location", () => {
  it("rejects half a coordinate pair or an impossible latitude", async () => {
    await expect(
      db.trainerProfile.update({ where: { userId: arun.userId }, data: { baseLatitude: "12.900000" } }),
    ).rejects.toThrow();
    await expect(
      db.trainerProfile.update({
        where: { userId: arun.userId },
        data: { baseLatitude: "95.000000", baseLongitude: "77.600000" },
      }),
    ).rejects.toThrow();
  });
});
