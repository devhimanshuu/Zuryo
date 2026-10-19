import { describe, expect, it } from "vitest";
import { calculatePriceBreakdown, findWindowOverlaps } from "@/lib/pricing";
import { pricingConfigInputSchema } from "@/lib/validation/pricing";

const valid = {
  standard: { sessionPrice: "399.00", commissionPercent: "10" },
  peak: {
    sessionPrice: "499",
    commissionPercent: "10",
    windows: [
      { label: "Weekday mornings", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540 },
      { label: "Weekday evenings", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 1020, endMinute: 1200 },
      { label: "Weekend mornings", daysOfWeek: [6, 7], startMinute: 420, endMinute: 660 },
    ],
  },
  basedOn: { standardRuleId: "rule_std", peakRuleId: "rule_peak" },
};

const withPeak = (patch: Partial<(typeof valid)["peak"]>) => ({ ...valid, peak: { ...valid.peak, ...patch } });

describe("pricing configuration validation", () => {
  it("accepts the seeded configuration", () => {
    expect(pricingConfigInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects overlapping peak windows on the same day as ambiguous", () => {
    const res = pricingConfigInputSchema.safeParse(
      withPeak({
        windows: [
          { label: "Mornings", daysOfWeek: [1, 2, 3], startMinute: 360, endMinute: 540 },
          { label: "Breakfast", daysOfWeek: [3, 4], startMinute: 480, endMinute: 600 },
        ],
      }),
    );
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toMatch(/ambiguous/);
    expect(res.error?.issues[0]?.path).toEqual(["peak", "windows", 1, "startMinute"]);
  });

  it("allows windows that only touch, or that share times on different days", () => {
    expect(
      findWindowOverlaps([
        { daysOfWeek: [1], startMinute: 360, endMinute: 540 },
        { daysOfWeek: [1], startMinute: 540, endMinute: 600 },
        { daysOfWeek: [2], startMinute: 360, endMinute: 540 },
      ]),
    ).toEqual([]);
  });

  it.each([
    ["peak cheaper than standard", withPeak({ sessionPrice: "299" })],
    ["no peak windows", withPeak({ windows: [] })],
    ["three-decimal price", { ...valid, standard: { ...valid.standard, sessionPrice: "399.001" } }],
    ["zero price", { ...valid, standard: { ...valid.standard, sessionPrice: "0" } }],
    ["commission over 100%", { ...valid, standard: { ...valid.standard, commissionPercent: "120" } }],
    ["window ending before it starts", withPeak({ windows: [{ label: "X", daysOfWeek: [1], startMinute: 600, endMinute: 540 }] })],
    ["window with no days", withPeak({ windows: [{ label: "X", daysOfWeek: [], startMinute: 360, endMinute: 540 }] })],
    ["unknown fields", { ...valid, sessionMinutes: 45 }],
    ["missing basedOn", { standard: valid.standard, peak: valid.peak }],
  ])("rejects %s", (_label, input) => {
    expect(pricingConfigInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("commission calculation", () => {
  it("rounds half-up at the paisa in integer arithmetic", () => {
    expect(calculatePriceBreakdown({ sessionPrice: "399", commissionPercent: "10" })).toMatchObject({
      commissionAmount: "39.90",
      totalAmount: "438.90",
    });
    // 1895.00 × 10% = 189.50 exactly; 333.33 × 12.5% = 41.66625 → 41.67; 10.05 × 10% = 1.005 → 1.01
    expect(calculatePriceBreakdown({ sessionPrice: "1895", commissionPercent: "10" }).commissionAmount).toBe("189.50");
    expect(calculatePriceBreakdown({ sessionPrice: "333.33", commissionPercent: "12.5" }).commissionAmount).toBe("41.67");
    expect(calculatePriceBreakdown({ sessionPrice: "10.05", commissionPercent: "10" }).commissionAmount).toBe("1.01");
  });

  it("keeps total = base + commission and net after commission = base", () => {
    for (const [price, pct] of [["399", "10"], ["499", "12.5"], ["3590", "7.25"], ["0.01", "50"]] as const) {
      const b = calculatePriceBreakdown({ sessionPrice: price, commissionPercent: pct });
      const paise = (v: string) => Math.round(Number(v) * 100);
      expect(paise(b.totalAmount) - paise(b.commissionAmount)).toBe(paise(b.sessionPrice));
    }
  });
});
