import { describe, expect, it } from "vitest";
import {
  availabilityInputSchema,
  cancelBookingInputSchema,
  createBookingInputSchema,
} from "@/lib/validation/booking";

const NOW = new Date("2026-10-19T04:30:00Z"); // Mon 10:00 IST
const schema = createBookingInputSchema(() => NOW);
const base = {
  workoutCategory: "STRENGTH",
  idempotencyKey: "6f1c2b9e-3d4a-4c8e-9b1f-2a7d5e8c0f11",
};

describe("createBookingInputSchema", () => {
  it("accepts a scheduled booking on the hour, more than 60 minutes away", () => {
    expect(schema.safeParse({ ...base, mode: "SCHEDULED", startAt: "2026-10-20T04:30:00Z" }).success).toBe(
      true,
    );
  });

  it("accepts an instant booking for a slot inside the next hour", () => {
    // 10:30 IST, 30 minutes from now
    expect(schema.safeParse({ ...base, mode: "INSTANT", startAt: "2026-10-19T05:00:00Z" }).success).toBe(
      true,
    );
  });

  it.each([
    ["missing start", undefined],
    ["within the instant window", "2026-10-19T05:00:00Z"],
    ["in the past", "2026-10-18T04:30:00Z"],
    ["exactly now", "2026-10-19T04:30:00Z"],
    ["more than 30 days ahead", "2026-11-25T04:30:00Z"],
    ["off the half-hour grid", "2026-10-20T04:45:00Z"],
    ["not a date", "next tuesday"],
  ])("rejects a scheduled booking with %s", (_label, startAt) => {
    expect(schema.safeParse({ ...base, mode: "SCHEDULED", startAt }).success).toBe(false);
  });

  it.each([
    ["two hours away (not instant)", "2026-10-19T06:30:00Z"],
    ["only 3 minutes away", "2026-10-19T04:33:00Z"],
    ["in the past", "2026-10-19T04:00:00Z"],
  ])("rejects an instant booking %s", (_label, startAt) => {
    expect(schema.safeParse({ ...base, mode: "INSTANT", startAt }).success).toBe(false);
  });

  it("refuses client-supplied prices, totals, zone or trainer assignment", () => {
    const ok = { ...base, mode: "SCHEDULED", startAt: "2026-10-20T04:30:00Z" };
    for (const extra of [
      { totalAmount: "1.00" },
      { sessionPrice: "1" },
      { trainerId: "seed_user_arjun" },
      { serviceZoneId: "seed_zone_palm_grove" },
      { status: "CONFIRMED" },
    ]) {
      expect(schema.safeParse({ ...ok, ...extra }).success).toBe(false);
    }
  });

  it("rejects an unknown or missing workout category", () => {
    const ok = { ...base, mode: "SCHEDULED", startAt: "2026-10-20T04:30:00Z" };
    expect(schema.safeParse({ ...ok, workoutCategory: "PILATES" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, workoutCategory: "strength" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, workoutCategory: undefined }).success).toBe(false);
  });

  it("requires a UUID idempotency key and a valid mode", () => {
    const ok = { ...base, mode: "SCHEDULED", startAt: "2026-10-20T04:30:00Z" };
    expect(schema.safeParse({ ...ok, idempotencyKey: "retry-1" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, mode: "LATER" }).success).toBe(false);
  });

  it("trims notes, strips control characters and caps their length", () => {
    const ok = { ...base, mode: "SCHEDULED", startAt: "2026-10-20T04:30:00Z" };
    const parsed = schema.parse({ ...ok, notes: "  Bring bands\u0007  " });
    expect(parsed.notes).toBe("Bring bands");
    expect(schema.parse({ ...ok, notes: "   " }).notes).toBeUndefined();
    expect(schema.safeParse({ ...ok, notes: "x".repeat(501) }).success).toBe(false);
  });

  it("only accepts a well-formed expected total (used as a guard, never as the price)", () => {
    const ok = { ...base, mode: "SCHEDULED", startAt: "2026-10-20T04:30:00Z" };
    expect(schema.safeParse({ ...ok, expectedTotal: "438.90" }).success).toBe(true);
    expect(schema.safeParse({ ...ok, expectedTotal: "438.9" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, expectedTotal: 438.9 }).success).toBe(false);
  });
});

describe("cancelBookingInputSchema", () => {
  it("accepts an id with an optional reason and rejects extras", () => {
    expect(cancelBookingInputSchema.safeParse({ bookingId: "bk_1" }).success).toBe(true);
    expect(cancelBookingInputSchema.safeParse({ bookingId: "bk_1", reason: "Travelling" }).success).toBe(
      true,
    );
    expect(cancelBookingInputSchema.safeParse({ bookingId: "" }).success).toBe(false);
    expect(cancelBookingInputSchema.safeParse({ bookingId: "bk_1", status: "CANCELLED" }).success).toBe(
      false,
    );
    expect(cancelBookingInputSchema.safeParse({ bookingId: "bk_1", reason: "x".repeat(281) }).success).toBe(
      false,
    );
  });
});

describe("availabilityInputSchema", () => {
  const ok = { date: "2026-10-20", startMinute: 360, endMinute: 720, status: "AVAILABLE" };
  it("accepts a half-hour aligned window", () => {
    expect(availabilityInputSchema.safeParse(ok).success).toBe(true);
  });
  it.each([
    ["an impossible date", { date: "2026-02-30" }],
    ["end before start", { startMinute: 720, endMinute: 600 }],
    ["off-grid minutes", { startMinute: 365 }],
    ["available time shorter than a session", { startMinute: 600, endMinute: 630 }],
  ])("rejects %s", (_l, patch) => {
    expect(availabilityInputSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
  it("allows short blocked periods", () => {
    expect(
      availabilityInputSchema.safeParse({ ...ok, status: "BLOCKED", startMinute: 600, endMinute: 630 })
        .success,
    ).toBe(true);
  });
});
