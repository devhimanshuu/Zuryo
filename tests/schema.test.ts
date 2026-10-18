import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking/rules";
import * as E from "@/lib/validation/enums";

const schema = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");
const migrationsDir = join(__dirname, "../prisma/migrations");
const migrationSql = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => readFileSync(join(migrationsDir, d.name, "migration.sql"), "utf8"))
  .join("\n");

function prismaEnum(name: string): string[] {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!m?.[1]) throw new Error(`enum ${name} not found`);
  return m[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

function modelBody(name: string): string {
  const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m?.[1]) throw new Error(`model ${name} not found`);
  return m[1];
}

describe("prisma schema", () => {
  it("keeps the shared enum constants identical to the database enums", () => {
    expect(prismaEnum("Role")).toEqual([...E.ROLES]);
    expect(prismaEnum("BookingMode")).toEqual([...E.BOOKING_MODES]);
    expect(prismaEnum("BookingStatus")).toEqual([...E.BOOKING_STATUSES]);
    expect(prismaEnum("FitnessLevel")).toEqual([...E.FITNESS_LEVELS]);
    expect(prismaEnum("FitnessGoal")).toEqual([...E.FITNESS_GOALS]);
    expect(prismaEnum("WorkoutPreference")).toEqual([...E.WORKOUT_PREFERENCES]);
    expect(prismaEnum("PricingKind")).toEqual([...E.PRICING_KINDS]);
    expect(prismaEnum("WorkoutCategory")).toEqual([...E.WORKOUT_CATEGORIES]);
    expect(prismaEnum("AvailabilityStatus")).toEqual([...E.AVAILABILITY_STATUSES]);
  });

  it("defines every core domain model", () => {
    for (const m of [
      "User",
      "CustomerProfile",
      "TrainerProfile",
      "TrainerAvailability",
      "Booking",
      "PricingRule",
      "Package",
      "Payment",
      "SessionRecord",
      "Notification",
    ]) {
      expect(() => modelBody(m)).not.toThrow();
    }
  });

  it("never stores money or percentages as floating point", () => {
    const code = schema.replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bFloat\b/);
    for (const field of ["sessionPrice", "commissionAmount", "totalAmount"]) {
      expect(modelBody("Booking")).toMatch(new RegExp(`${field}\\s+Decimal\\s+@db\\.Decimal\\(10, 2\\)`));
    }
    expect(modelBody("Payment")).toMatch(/amount\s+Decimal\s+@db\.Decimal\(10, 2\)/);
  });

  it("stores every timestamp with its time zone", () => {
    const dateTimes = schema.match(/^\s+\w+\s+DateTime\??.*$/gm) ?? [];
    expect(dateTimes.length).toBeGreaterThan(20);
    for (const line of dateTimes) expect(line).toContain("@db.Timestamptz(3)");
  });

  it("has the uniqueness guards later phases rely on for idempotency", () => {
    expect(modelBody("Booking")).toMatch(/idempotencyKey\s+String\?\s+@unique/);
    expect(modelBody("Payment")).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(modelBody("PackageLedgerEntry")).toContain("@@unique([bookingId, reason])");
    expect(modelBody("SessionRecord")).toMatch(/bookingId\s+String\s+@unique/);
  });

  it("ships database constraints the Prisma DSL can't express", () => {
    expect(migrationSql).toContain('"Booking_amounts_check"');
    expect(migrationSql).toContain('"Package_sessions_check"');
    expect(migrationSql).toContain('"PricingRule_one_active_per_kind"');
    expect(migrationSql).toContain('"Booking_range_check"');
  });

  it("prevents overlapping active bookings in the database, not just in application code", () => {
    expect(migrationSql).toMatch(/CREATE EXTENSION IF NOT EXISTS btree_gist/);
    for (const [name, column] of [
      ["Booking_trainer_no_overlap", "trainerId"],
      ["Booking_customer_no_overlap", "customerId"],
    ]) {
      const start = migrationSql.indexOf(`"${name}"`);
      expect(start, name).toBeGreaterThan(-1);
      const statement = migrationSql.slice(start, migrationSql.indexOf(";", start));
      expect(statement).toContain(
        `EXCLUDE USING gist ("${column}" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&)`,
      );
      // The constraint's notion of "active" must match the application's.
      const predicate = statement.slice(statement.indexOf("WHERE"));
      for (const status of ACTIVE_BOOKING_STATUSES) expect(predicate).toContain(`'${status}'`);
      expect(predicate).not.toContain("'CANCELLED'");
    }
  });
});
