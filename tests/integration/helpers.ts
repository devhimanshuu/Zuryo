import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { zonedDayStart } from "@/lib/booking/time";
import { pgPoolConfig } from "@/lib/db/pool";
import type { Actor } from "@/server/auth/actor";
import type { BookingDeps } from "@/server/booking/deps";

export const TZ = "Asia/Kolkata";
/** Fixed clock for every test: Monday 7 Jan 2030, 10:00 IST. */
export const NOW = new Date("2030-01-07T04:30:00Z");
export const TODAY = "2030-01-07";
export const TOMORROW = "2030-01-08";

/** A UTC instant for local IST wall-clock time on a given day. */
export function ist(day: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(zonedDayStart(day, TZ).getTime() + (h * 60 + m) * 60_000);
}

export function createTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg(pgPoolConfig(url)) });
}

export type TestDb = ReturnType<typeof createTestDb>;

/** Generous transaction bounds: the test database may be a long network hop away. */
export function testDeps(db: TestDb, now: Date = NOW): BookingDeps {
  return { db, now: () => now, tx: { maxWait: 30_000, timeout: 60_000 } };
}

export const ZONE = "it_zone_main";
export const OTHER_ZONE = "it_zone_other";

const customer = (id: string, name: string): Actor => ({ userId: id, role: "CUSTOMER", name });
export const alice = customer("it_alice", "Alice Rao");
export const bob = customer("it_bob", "Bob Iyer");
export const cara = customer("it_cara", "Cara Shah");
/** Extra customers for concurrency tests. */
export const crowd = Array.from({ length: 8 }, (_, i) => customer(`it_crowd_${i}`, `Crowd ${i}`));

export const arun: Actor = { userId: "it_arun", role: "TRAINER", name: "Arun (strength, mobility)" };
export const bela: Actor = { userId: "it_bela", role: "TRAINER", name: "Bela (mobility, yoga)" };
export const idle = "it_idle"; // inactive trainer
export const zed = "it_zed"; // trainer in another community
export const ops: Actor = { userId: "it_ops", role: "OPERATIONS", name: "Ops" };

export function request(overrides: Record<string, unknown> = {}) {
  return {
    mode: "SCHEDULED",
    workoutCategory: "STRENGTH",
    startAt: ist(TOMORROW, "10:00").toISOString(),
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

const TABLES = [
  "Notification",
  "SessionRecord",
  "Payment",
  "PackageLedgerEntry",
  "Package",
  "Booking",
  "PeakWindow",
  "PricingRule",
  "TrainerAvailability",
  "TrainerProfile",
  "CustomerProfile",
  "ServiceZone",
  "User",
];

/** Wipe the test database and load a small, known world. */
export async function resetAndSeed(db: TestDb) {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);

  await db.serviceZone.createMany({
    data: [
      {
        id: ZONE,
        slug: "it-main",
        name: "Test Residences",
        city: "Bengaluru",
        latitude: "12.9",
        longitude: "77.6",
      },
      {
        id: OTHER_ZONE,
        slug: "it-other",
        name: "Other Towers",
        city: "Bengaluru",
        latitude: "13.0",
        longitude: "77.5",
      },
    ],
  });
  const customers = [alice, bob, cara, ...crowd];
  await db.user.createMany({
    data: [
      ...customers.map((c) => ({
        id: c.userId,
        name: c.name,
        email: `${c.userId}@test.example`,
        role: "CUSTOMER" as const,
      })),
      ...[arun, bela].map((t) => ({
        id: t.userId,
        name: t.name,
        email: `${t.userId}@test.example`,
        role: "TRAINER" as const,
      })),
      { id: idle, name: "Idle Trainer", email: "idle@test.example", role: "TRAINER" },
      { id: zed, name: "Zed Elsewhere", email: "zed@test.example", role: "TRAINER" },
      { id: ops.userId, name: ops.name, email: "ops@test.example", role: "OPERATIONS" },
    ],
  });
  await db.customerProfile.createMany({
    data: customers.map((c) => ({ userId: c.userId, serviceZoneId: ZONE, addressLine: "Tower A, 101" })),
  });
  await db.trainerProfile.createMany({
    data: [
      {
        userId: arun.userId,
        serviceZoneId: ZONE,
        workoutCategories: ["STRENGTH", "MOBILITY"],
        specializations: ["Strength"],
      },
      {
        userId: bela.userId,
        serviceZoneId: ZONE,
        workoutCategories: ["MOBILITY", "YOGA"],
        specializations: ["Mobility"],
      },
      { userId: idle, serviceZoneId: ZONE, workoutCategories: ["STRENGTH"], isActive: false },
      { userId: zed, serviceZoneId: OTHER_ZONE, workoutCategories: ["STRENGTH"] },
    ],
  });
  const window = (trainerId: string, day: string, from: string, to: string) => ({
    trainerId,
    startAt: ist(day, from),
    endAt: ist(day, to),
    status: "AVAILABLE" as const,
  });
  await db.trainerAvailability.createMany({
    data: [
      window(arun.userId, TODAY, "10:00", "13:00"), // instant-bookable this morning
      window(arun.userId, TOMORROW, "06:00", "12:00"),
      window(arun.userId, TOMORROW, "16:00", "21:00"),
      window(bela.userId, TOMORROW, "06:00", "12:00"),
      window(idle, TOMORROW, "06:00", "12:00"),
      window(zed, TOMORROW, "06:00", "12:00"),
    ],
  });
  const since = new Date("2029-01-01T00:00:00Z");
  await db.pricingRule.createMany({
    data: [
      {
        id: "it_normal",
        name: "Standard session",
        kind: "NORMAL",
        sessionPrice: "399.00",
        commissionPercent: "10.00",
        effectiveFrom: since,
      },
      {
        id: "it_peak",
        name: "Peak session",
        kind: "PEAK",
        sessionPrice: "499.00",
        commissionPercent: "10.00",
        effectiveFrom: since,
      },
    ],
  });
  await db.peakWindow.createMany({
    data: [
      {
        pricingRuleId: "it_peak",
        label: "Weekday mornings",
        daysOfWeek: [1, 2, 3, 4, 5],
        startMinute: 360,
        endMinute: 540,
      },
      {
        pricingRuleId: "it_peak",
        label: "Weekday evenings",
        daysOfWeek: [1, 2, 3, 4, 5],
        startMinute: 1020,
        endMinute: 1200,
      },
    ],
  });
}

export async function activeBookings(db: TestDb, trainerId: string) {
  return db.booking.findMany({
    where: { trainerId, status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] } },
    orderBy: { startAt: "asc" },
  });
}
