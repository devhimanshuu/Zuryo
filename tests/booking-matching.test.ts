import { describe, expect, it } from "vitest";
import {
  findEarliestMatch,
  ineligibility,
  rankTrainers,
  type TrainerCandidate,
} from "@/lib/booking/matching";
import { quoteSession, type ActivePricing } from "@/lib/booking/pricing";
import { zonedDayStart } from "@/lib/booking/time";

const TZ = "Asia/Kolkata";
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(zonedDayStart(day, TZ).getTime() + (h * 60 + m) * 60_000);
};
const TUE = "2026-10-20";
const hour = (day: string, hhmm: string) => ({
  startAt: at(day, hhmm),
  endAt: new Date(at(day, hhmm).getTime() + 3_600_000),
  status: "CONFIRMED" as const,
});

function trainer(
  id: string,
  categories: TrainerCandidate["categories"],
  extra: Partial<TrainerCandidate> = {},
): TrainerCandidate {
  return {
    trainerId: id,
    name: id.toUpperCase(),
    isActive: true,
    categories,
    schedule: {
      windows: [{ startAt: at(TUE, "06:00"), endAt: at(TUE, "21:00"), status: "AVAILABLE" }],
      bookings: [],
    },
    ...extra,
  };
}

describe("rankTrainers", () => {
  const criteria = { category: "MOBILITY" as const, startAt: at(TUE, "10:00"), timeZone: TZ };

  it("only returns trainers who coach the category and are free", () => {
    const busy = trainer("busy", ["MOBILITY"], {
      schedule: {
        windows: [{ startAt: at(TUE, "06:00"), endAt: at(TUE, "21:00"), status: "AVAILABLE" }],
        bookings: [hour(TUE, "09:30")],
      },
    });
    const ranked = rankTrainers(
      [trainer("yoga", ["YOGA"]), busy, trainer("free", ["STRENGTH", "MOBILITY"])],
      criteria,
    );
    expect(ranked.map((t) => t.trainerId)).toEqual(["free"]);
    expect(ineligibility(trainer("yoga", ["YOGA"]), criteria)).toBe("CATEGORY");
    expect(ineligibility(busy, criteria)).toBe("BOOKED");
  });

  it("never matches an inactive trainer", () => {
    const idle = trainer("idle", ["MOBILITY"], { isActive: false });
    expect(rankTrainers([idle], criteria)).toEqual([]);
    expect(ineligibility(idle, criteria)).toBe("INACTIVE");
  });

  it("puts primary focus first, then the lighter day, then a fixed id order", () => {
    const secondary = trainer("a-secondary", ["STRENGTH", "MOBILITY"]);
    const primaryBusy = trainer("b-primary-busy", ["MOBILITY"], {
      schedule: {
        windows: [{ startAt: at(TUE, "06:00"), endAt: at(TUE, "21:00"), status: "AVAILABLE" }],
        bookings: [hour(TUE, "07:00"), hour(TUE, "18:00")],
      },
    });
    const primaryLight = trainer("c-primary-light", ["MOBILITY", "YOGA"]);
    const primaryTwin = trainer("d-primary-light", ["MOBILITY"]);
    const ranked = rankTrainers([secondary, primaryBusy, primaryTwin, primaryLight], criteria);
    expect(ranked.map((t) => t.trainerId)).toEqual([
      "c-primary-light",
      "d-primary-light",
      "b-primary-busy",
      "a-secondary",
    ]);
    expect(ranked.map((t) => t.rank)).toEqual([1, 2, 3, 4]);
    expect(ranked[2]!.reasons).toContain("2 other sessions that day");
    expect(ranked[3]!.reasons[0]).toBe("Also coaches mobility & flexibility");
  });

  it("is deterministic regardless of input order", () => {
    const pool = [trainer("x", ["MOBILITY"]), trainer("m", ["MOBILITY"]), trainer("b", ["MOBILITY"])];
    const a = rankTrainers(pool, criteria).map((t) => t.trainerId);
    const b = rankTrainers([...pool].reverse(), criteria).map((t) => t.trainerId);
    expect(a).toEqual(["b", "m", "x"]);
    expect(b).toEqual(a);
  });
});

describe("findEarliestMatch", () => {
  it("returns the earliest start that has an eligible trainer", () => {
    const t = trainer("t", ["CARDIO"], {
      schedule: {
        windows: [{ startAt: at(TUE, "06:00"), endAt: at(TUE, "21:00"), status: "AVAILABLE" }],
        bookings: [hour(TUE, "10:00")],
      },
    });
    const match = findEarliestMatch([t], "CARDIO", [at(TUE, "11:00"), at(TUE, "10:30")], TZ);
    expect(match?.startAt).toEqual(at(TUE, "11:00"));
  });

  it("returns null instead of inventing availability", () => {
    expect(findEarliestMatch([trainer("t", ["YOGA"])], "CARDIO", [at(TUE, "10:30")], TZ)).toBeNull();
    expect(findEarliestMatch([], "CARDIO", [at(TUE, "10:30")], TZ)).toBeNull();
  });
});

describe("quoteSession (server-side pricing)", () => {
  const pricing: ActivePricing = {
    normal: {
      id: "normal",
      name: "Standard session",
      sessionPrice: "399.00",
      commissionPercent: "10.00",
      currency: "INR",
    },
    peak: {
      id: "peak",
      name: "Peak session",
      sessionPrice: "499.00",
      commissionPercent: "10.00",
      currency: "INR",
      peakWindows: [
        { label: "Weekday mornings", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540 },
        { label: "Weekend mornings", daysOfWeek: [6, 7], startMinute: 420, endMinute: 660 },
      ],
    },
  };

  it("prices an off-peak slot with the standard rule", () => {
    expect(quoteSession(pricing, at(TUE, "10:00"), TZ)).toMatchObject({
      pricingRuleId: "normal",
      isPeak: false,
      peakLabel: null,
      sessionPrice: "399.00",
      commissionAmount: "39.90",
      totalAmount: "438.90",
      peakUplift: "0.00",
    });
  });

  it("applies peak pricing only when the configured window matches", () => {
    expect(quoteSession(pricing, at(TUE, "07:00"), TZ)).toMatchObject({
      pricingRuleId: "peak",
      isPeak: true,
      peakLabel: "Weekday mornings",
      totalAmount: "548.90",
      standardSessionPrice: "399.00",
      peakUplift: "100.00",
    });
    expect(quoteSession(pricing, at(TUE, "09:00"), TZ).isPeak).toBe(false); // window end is exclusive
    expect(quoteSession(pricing, at("2026-10-24", "10:00"), TZ)).toMatchObject({
      isPeak: true,
      peakLabel: "Weekend mornings",
    });
    expect(quoteSession(pricing, at("2026-10-23", "10:00"), TZ).isPeak).toBe(false); // Friday 10:00
  });

  it("never applies peak pricing when no peak rule is configured", () => {
    expect(quoteSession({ ...pricing, peak: null }, at(TUE, "07:00"), TZ)).toMatchObject({
      isPeak: false,
      totalAmount: "438.90",
    });
  });
});
