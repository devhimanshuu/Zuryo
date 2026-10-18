import { describe, expect, it } from "vitest";
import { calculatePriceBreakdown, formatINR, fromPaise, isPeakStart, toPaise } from "@/lib/pricing";
import { pricingRuleInputSchema } from "@/lib/validation/pricing";

describe("calculatePriceBreakdown", () => {
  it("prices a normal slot exactly as the brief specifies", () => {
    expect(calculatePriceBreakdown({ sessionPrice: "399.00", commissionPercent: "10.00" })).toEqual({
      sessionPrice: "399.00",
      commissionPercent: "10.00",
      commissionAmount: "39.90",
      totalAmount: "438.90",
    });
  });

  it("prices a peak slot exactly as the brief specifies", () => {
    const b = calculatePriceBreakdown({ sessionPrice: "499", commissionPercent: "10" });
    expect([b.commissionAmount, b.totalAmount]).toEqual(["49.90", "548.90"]);
  });

  it("rounds half-up at the paisa without floating-point drift", () => {
    // 0.1 + 0.2 style traps: 333.33 × 12.5% = 41.66625 → 41.67
    expect(
      calculatePriceBreakdown({ sessionPrice: "333.33", commissionPercent: "12.5" }).commissionAmount,
    ).toBe("41.67");
    // 10.05 × 10% = 1.005 → 1.01 (a float would give 1.00)
    expect(calculatePriceBreakdown({ sessionPrice: "10.05", commissionPercent: "10" }).commissionAmount).toBe(
      "1.01",
    );
  });

  it("refuses malformed amounts instead of guessing", () => {
    expect(() => toPaise("39.999")).toThrow();
    expect(() => toPaise("-5")).toThrow();
    expect(() => calculatePriceBreakdown({ sessionPrice: "399", commissionPercent: "101" })).toThrow();
  });

  it("round-trips paise and formats INR for display", () => {
    expect(fromPaise(toPaise("438.9"))).toBe("438.90");
    expect(formatINR("438.90")).toBe("₹438.90");
    expect(formatINR("100000")).toBe("₹1,00,000.00");
  });
});

describe("isPeakStart", () => {
  const windows = [
    { daysOfWeek: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540 }, // weekdays 06:00–09:00
    { daysOfWeek: [6, 7], startMinute: 420, endMinute: 660 }, // weekends 07:00–11:00
  ];
  // 2026-10-19 is a Monday. 07:00 IST = 01:30 UTC.
  it("uses the zone's local time, not UTC", () => {
    expect(isPeakStart(new Date("2026-10-19T01:30:00Z"), windows, "Asia/Kolkata")).toBe(true);
    expect(isPeakStart(new Date("2026-10-19T07:00:00Z"), windows, "Asia/Kolkata")).toBe(false); // 12:30 IST
  });

  it("treats the window end as exclusive", () => {
    expect(isPeakStart(new Date("2026-10-19T03:30:00Z"), windows, "Asia/Kolkata")).toBe(false); // 09:00 IST
    expect(isPeakStart(new Date("2026-10-19T03:29:00Z"), windows, "Asia/Kolkata")).toBe(true); // 08:59 IST
  });

  it("applies weekend windows only on weekends", () => {
    expect(isPeakStart(new Date("2026-10-24T04:30:00Z"), windows, "Asia/Kolkata")).toBe(true); // Sat 10:00
    expect(isPeakStart(new Date("2026-10-23T04:30:00Z"), windows, "Asia/Kolkata")).toBe(false); // Fri 10:00
  });
});

describe("pricingRuleInputSchema", () => {
  const peak = {
    name: "Peak session",
    kind: "PEAK" as const,
    sessionPrice: "499.00",
    commissionPercent: "10",
    peakWindows: [{ label: "Mornings", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540 }],
  };

  it("accepts a valid peak rule", () => {
    expect(pricingRuleInputSchema.safeParse(peak).success).toBe(true);
  });

  it.each([
    ["three decimals", { sessionPrice: "499.999" }],
    ["zero price", { sessionPrice: "0" }],
    ["negative", { sessionPrice: "-1" }],
    ["number instead of string", { sessionPrice: 499 }],
    ["commission over 100%", { commissionPercent: "120" }],
    [
      "window ends before it starts",
      { peakWindows: [{ ...peak.peakWindows[0], startMinute: 600, endMinute: 540 }] },
    ],
    ["repeated weekday", { peakWindows: [{ ...peak.peakWindows[0], daysOfWeek: [1, 1] }] }],
    ["peak rule without windows", { peakWindows: [] }],
  ])("rejects %s", (_label, patch) => {
    expect(pricingRuleInputSchema.safeParse({ ...peak, ...patch }).success).toBe(false);
  });

  it("rejects peak windows on a normal rule", () => {
    expect(pricingRuleInputSchema.safeParse({ ...peak, kind: "NORMAL" }).success).toBe(false);
  });
});
