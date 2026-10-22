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

describe("distance in matching", () => {
  const criteria = { category: "MOBILITY" as const, startAt: at(TUE, "10:00"), timeZone: TZ };
  const travel = (travelMinutes: number) => ({ roadKm: travelMinutes / 4, travelMinutes });

  it("ranks the nearer trainer first when primary focus is equal", () => {
    const far = trainer("a-far", ["MOBILITY"], { travel: travel(28) });
    const near = trainer("z-near", ["MOBILITY"], { travel: travel(13) });
    const ranked = rankTrainers([far, near], criteria);
    expect(ranked.map((t) => t.trainerId)).toEqual(["z-near", "a-far"]);
    expect(ranked[0]!.travel).toEqual(travel(13));
  });

  it("keeps primary focus ahead of distance", () => {
    const nearSecondary = trainer("near-secondary", ["STRENGTH", "MOBILITY"], { travel: travel(9) });
    const farPrimary = trainer("far-primary", ["MOBILITY"], { travel: travel(40) });
    expect(rankTrainers([nearSecondary, farPrimary], criteria).map((t) => t.trainerId)).toEqual([
      "far-primary",
      "near-secondary",
    ]);
  });

  it("treats trips in the same 5-minute band as equally near, so the lighter day decides", () => {
    const nearButBusy = trainer("a-busy", ["MOBILITY"], {
      travel: travel(11),
      schedule: {
        windows: [{ startAt: at(TUE, "06:00"), endAt: at(TUE, "21:00"), status: "AVAILABLE" }],
        bookings: [hour(TUE, "07:00")],
      },
    });
    const slightlyFartherFree = trainer("b-free", ["MOBILITY"], { travel: travel(14) });
    expect(rankTrainers([nearButBusy, slightlyFartherFree], criteria).map((t) => t.trainerId)).toEqual([
      "b-free",
      "a-busy",
    ]);
  });

  it("puts trainers without a location after those with one, and still matches them", () => {
    const unknown = trainer("a-unknown", ["MOBILITY"]);
    const located = trainer("z-located", ["MOBILITY"], { travel: travel(30) });
    expect(rankTrainers([unknown, located], criteria).map((t) => t.trainerId)).toEqual([
      "z-located",
      "a-unknown",
    ]);
  });

  it("rules out a trainer who can't arrive by the start when the caller says when they'd set out", () => {
    const far = trainer("far", ["MOBILITY"], { travel: travel(28) });
    const near = trainer("near", ["MOBILITY"], { travel: travel(13) });
    const soon = { ...criteria, departFrom: at(TUE, "09:40") }; // 20 minutes before the start
    expect(ineligibility(far, soon)).toBe("OUT_OF_REACH");
    expect(ineligibility(near, soon)).toBeNull();
    expect(rankTrainers([far, near], soon).map((t) => t.trainerId)).toEqual(["near"]);
    // Exactly enough time counts as reachable; without a departure time distance never excludes.
    expect(ineligibility(far, { ...criteria, departFrom: at(TUE, "09:32") })).toBeNull();
    expect(ineligibility(far, criteria)).toBeNull();
  });

  it("moves an instant match to the first start the trainer can actually reach", () => {
    const far = trainer("far", ["MOBILITY"], { travel: travel(28) });
    const starts = [at(TUE, "10:30"), at(TUE, "10:00")];
    const match = findEarliestMatch([far], "MOBILITY", starts, TZ, at(TUE, "09:45"));
    expect(match?.startAt).toEqual(at(TUE, "10:30"));
    expect(findEarliestMatch([far], "MOBILITY", [at(TUE, "10:00")], TZ, at(TUE, "09:45"))).toBeNull();
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
