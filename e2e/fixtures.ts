import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { zonedDayStart } from "@/lib/booking/time";
import { pgPoolConfig } from "@/lib/db/pool";

/**
 * Deterministic E2E world, anchored to the real clock (unlike the vitest fixtures, which use a
 * fixed 2030 clock). Everything is truncated and re-created per run, so browser tests never touch
 * the demo database and never depend on each other's leftovers.
 */

export const E2E_PASSWORD = "e2e-test-password";
export const TZ = "Asia/Kolkata";

export const ALICE = { id: "e2e_alice", email: "e2e-alice@test.example" };
export const ARUN = { id: "e2e_arun", email: "e2e-arun@test.example" };
export const OPS = { id: "e2e_ops", email: "e2e-ops@test.example" };
const ZONE = "e2e_zone_main";

export function e2eDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const database = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(database)) {
    throw new Error(
      `Refusing to run E2E: TEST_DATABASE_URL database "${database}" must contain "test" (the suite TRUNCATEs every table).`,
    );
  }
  return new PrismaClient({ adapter: new PrismaPg(pgPoolConfig(url)) });
}

export function ist(hour: number, minute = 0, dayOffset = 0) {
  const base = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(base);
  const start = zonedDayStart(todayKey, TZ);
  return new Date(start.getTime() + dayOffset * 86_400_000 + (hour * 60 + minute) * 60_000);
}

const TABLES = [
  "AiRequestLog",
  "WorkoutRecommendation",
  "FitnessGoalTracking",
  "Notification",
  "PackagePlan",
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

/** Wipes and rebuilds the E2E world. Safe to run repeatedly. */
export async function resetAndSeedE2E(db: ReturnType<typeof e2eDb>) {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
  const passwordHash = hashSync(E2E_PASSWORD, 10);

  await db.serviceZone.create({
    data: {
      id: ZONE,
      slug: "e2e-main",
      name: "E2E Residences",
      city: "Bengaluru",
      latitude: "12.9",
      longitude: "77.6",
    },
  });

  await db.user.createMany({
    data: [
      { id: ALICE.id, name: "Alice", email: ALICE.email, role: "CUSTOMER", passwordHash },
      { id: "e2e_bob", name: "Bob", email: "e2e-bob@test.example", role: "CUSTOMER", passwordHash },
      { id: ARUN.id, name: "Arun", email: ARUN.email, role: "TRAINER", passwordHash },
      { id: "e2e_bela", name: "Bela", email: "e2e-bela@test.example", role: "TRAINER", passwordHash },
      { id: OPS.id, name: "Ops", email: OPS.email, role: "OPERATIONS", passwordHash },
    ],
  });
  await db.customerProfile.createMany({
    data: [
      {
        userId: ALICE.id,
        serviceZoneId: ZONE,
        addressLine: "Tower A, 101",
        fitnessGoals: ["STRENGTH"],
        fitnessLevel: "BEGINNER",
        equipment: ["MAT"],
        assessedAt: new Date(),
      },
      { userId: "e2e_bob", serviceZoneId: ZONE, addressLine: "Tower B, 202" },
    ],
  });
  await db.trainerProfile.createMany({
    data: [
      {
        userId: ARUN.id,
        serviceZoneId: ZONE,
        workoutCategories: ["STRENGTH", "MOBILITY"],
        specializations: ["Strength"],
      },
      {
        userId: "e2e_bela",
        serviceZoneId: ZONE,
        workoutCategories: ["MOBILITY", "YOGA"],
        specializations: ["Mobility"],
      },
    ],
  });

  // Both trainers are available 06:00–12:00 and 16:00–21:00 IST for the next 8 days.
  const windows = [ARUN.id, "e2e_bela"].flatMap((trainerId) =>
    Array.from({ length: 8 }, (_, d) => [
      { trainerId, startAt: ist(6, 0, d), endAt: ist(12, 0, d) },
      { trainerId, startAt: ist(16, 0, d), endAt: ist(21, 0, d) },
    ]).flat(),
  );
  await db.trainerAvailability.createMany({ data: windows });

  const since = new Date("2025-01-01T00:00:00Z");
  await db.pricingRule.createMany({
    data: [
      {
        id: "e2e_normal",
        name: "Standard session",
        kind: "NORMAL",
        sessionPrice: "399.00",
        commissionPercent: "10.00",
        effectiveFrom: since,
      },
      {
        id: "e2e_peak",
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
        pricingRuleId: "e2e_peak",
        label: "Weekday mornings",
        daysOfWeek: [1, 2, 3, 4, 5],
        startMinute: 360,
        endMinute: 540,
      },
      {
        pricingRuleId: "e2e_peak",
        label: "Weekday evenings",
        daysOfWeek: [1, 2, 3, 4, 5],
        startMinute: 1020,
        endMinute: 1200,
      },
    ],
  });
  await db.packagePlan.createMany({
    data: [
      {
        id: "e2e_plan_single",
        slug: "single-session",
        name: "Single Session",
        sessionCount: 1,
        price: "399.00",
        validityDays: 30,
        sortOrder: 1,
      },
      {
        id: "e2e_plan_starter",
        slug: "starter-pack",
        name: "Starter Pack",
        sessionCount: 5,
        price: "1895.00",
        validityDays: 60,
        sortOrder: 2,
      },
      {
        id: "e2e_plan_fitness",
        slug: "fitness-pack",
        name: "Fitness Pack",
        sessionCount: 10,
        price: "3590.00",
        validityDays: 90,
        sortOrder: 3,
      },
    ],
  });
}
