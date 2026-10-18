import { describe, expect, it } from "vitest";
import { createBookingInputSchema } from "@/lib/validation/booking";

const NOW = new Date("2026-10-19T04:30:00Z"); // Mon 10:00 IST
const schema = createBookingInputSchema(() => NOW);
const base = {
  serviceZoneId: "seed_zone_palm_grove",
  idempotencyKey: "6f1c2b9e-3d4a-4c8e-9b1f-2a7d5e8c0f11",
};

describe("createBookingInputSchema", () => {
  it("accepts an instant booking without a start time", () => {
    expect(schema.safeParse({ ...base, mode: "INSTANT" }).success).toBe(true);
  });

  it("rejects an instant booking that tries to set its own start", () => {
    expect(schema.safeParse({ ...base, mode: "INSTANT", startAt: "2026-10-19T06:30:00Z" }).success).toBe(
      false,
    );
  });

  it("accepts a scheduled booking on the hour, more than 60 minutes away", () => {
    expect(schema.safeParse({ ...base, mode: "SCHEDULED", startAt: "2026-10-20T04:30:00Z" }).success).toBe(
      true,
    );
  });

  it.each([
    ["missing start", undefined],
    ["within the instant window", "2026-10-19T05:00:00Z"],
    ["in the past", "2026-10-18T04:30:00Z"],
    ["more than 30 days ahead", "2026-11-25T04:30:00Z"],
    ["off the half-hour grid", "2026-10-20T04:45:00Z"],
  ])("rejects a scheduled booking with %s", (_label, startAt) => {
    expect(schema.safeParse({ ...base, mode: "SCHEDULED", startAt }).success).toBe(false);
  });

  it("refuses client-supplied prices, totals or trainer assignment", () => {
    for (const extra of [{ totalAmount: "1.00" }, { sessionPrice: "1" }, { trainerId: "seed_user_arjun" }]) {
      expect(schema.safeParse({ ...base, mode: "INSTANT", ...extra }).success).toBe(false);
    }
  });

  it("requires a UUID idempotency key", () => {
    expect(schema.safeParse({ ...base, mode: "INSTANT", idempotencyKey: "retry-1" }).success).toBe(false);
  });
});
