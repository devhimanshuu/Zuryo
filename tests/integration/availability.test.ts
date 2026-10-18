import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBooking } from "@/server/booking/booking-service";
import { addAvailability, removeAvailability } from "@/server/booking/trainer-availability-service";
import { getSchedule, loadCustomerContext } from "@/server/booking/availability-service";
import {
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

const db = createTestDb();
const deps = testDeps(db);

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

describe("trainer availability management", () => {
  it("opens new bookable time that the matcher then uses", async () => {
    // 13:00 tomorrow is outside Arun's availability until he adds 12:00–14:00.
    const before = await createBooking(
      deps,
      alice,
      request({ startAt: ist(TOMORROW, "13:00").toISOString() }),
    );
    expect(before.ok).toBe(false);
    const added = await addAvailability(deps, arun, {
      date: TOMORROW,
      startMinute: 12 * 60,
      endMinute: 14 * 60,
      status: "AVAILABLE",
    });
    expect(added.ok).toBe(true);
    const after = await createBooking(
      deps,
      alice,
      request({ startAt: ist(TOMORROW, "13:00").toISOString() }),
    );
    expect(after.ok).toBe(true);
  });

  it("blocks time so no new bookings land there, and refuses to block over a booking", async () => {
    expect((await createBooking(deps, alice, request())).ok).toBe(true); // 10:00 with Arun
    const overBooking = await addAvailability(deps, arun, {
      date: TOMORROW,
      startMinute: 10 * 60,
      endMinute: 11 * 60,
      status: "BLOCKED",
    });
    expect(overBooking.ok).toBe(false);
    if (!overBooking.ok) expect(overBooking.error.message).toMatch(/session with Alice/);

    const block = await addAvailability(deps, arun, {
      date: TOMORROW,
      startMinute: 7 * 60,
      endMinute: 8 * 60,
      status: "BLOCKED",
      note: "Dentist",
    });
    expect(block.ok).toBe(true);
    const res = await createBooking(deps, bob, request({ startAt: ist(TOMORROW, "07:30").toISOString() }));
    expect(res.ok).toBe(false);

    const customer = (await loadCustomerContext(db, bob.userId))!;
    const schedule = await getSchedule(deps, customer, "STRENGTH", 2);
    const slots = schedule.days.find((d) => d.dateKey === TOMORROW)!.slots;
    const status = (hhmm: string) =>
      slots.find((s) => s.startAt === ist(TOMORROW, hhmm).toISOString())?.status;
    expect(status("07:00")).toBe("UNAVAILABLE"); // blocked
    expect(status("10:30")).toBe("UNAVAILABLE"); // overlaps Alice's 10:00 session
    expect(status("08:00")).toBe("AVAILABLE");
    expect(status("11:00")).toBe("AVAILABLE");
  });

  it("refuses overlapping windows and removal of time that holds bookings", async () => {
    const overlap = await addAvailability(deps, arun, {
      date: TOMORROW,
      startMinute: 11 * 60,
      endMinute: 13 * 60,
      status: "AVAILABLE",
    });
    expect(overlap.ok).toBe(false);

    expect((await createBooking(deps, alice, request())).ok).toBe(true);
    const morning = await db.trainerAvailability.findFirstOrThrow({
      where: { trainerId: arun.userId, startAt: ist(TOMORROW, "06:00") },
    });
    const removal = await removeAvailability(deps, arun, { availabilityId: morning.id });
    expect(removal.ok).toBe(false);

    const evening = await db.trainerAvailability.findFirstOrThrow({
      where: { trainerId: arun.userId, startAt: ist(TOMORROW, "16:00") },
    });
    expect((await removeAvailability(deps, arun, { availabilityId: evening.id })).ok).toBe(true);
  });

  it("does not let a trainer edit someone else's availability", async () => {
    const window = await db.trainerAvailability.findFirstOrThrow({ where: { trainerId: arun.userId } });
    const res = await removeAvailability(deps, bela, { availabilityId: window.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
    expect(await db.trainerAvailability.count({ where: { id: window.id } })).toBe(1);
  });
});
