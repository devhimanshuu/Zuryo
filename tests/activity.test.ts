import { describe, expect, it } from "vitest";
import {
  activityByDay,
  currentStreak,
  lastDayKeys,
  weekStartOf,
  weeksOfActivity,
} from "@/lib/activity";

const TZ = "Asia/Kolkata";

describe("lastDayKeys", () => {
  it("returns ascending keys ending with the given day", () => {
    expect(lastDayKeys("2026-10-22", 3)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });
});

describe("activityByDay", () => {
  it("buckets instants by local calendar day and keeps empty days", () => {
    const dates = [
      new Date("2026-10-22T05:00:00Z"),
      new Date("2026-10-21T20:00:00Z"),
      new Date("2026-10-20T05:00:00Z"),
    ];
    const days = activityByDay(dates, "2026-10-22", TZ, 3);
    expect(days.map((d) => [d.dateKey, d.count])).toEqual([
      ["2026-10-20", 1],
      ["2026-10-21", 0],
      ["2026-10-22", 2],
    ]);
    expect(days[2]!.label).toBe("Thu");
  });
});

describe("currentStreak", () => {
  it("counts consecutive active days ending today", () => {
    const dates = [
      new Date("2026-10-22T05:00:00Z"),
      new Date("2026-10-21T05:00:00Z"),
      new Date("2026-10-20T05:00:00Z"),
    ];
    expect(currentStreak(dates, "2026-10-22", TZ)).toBe(3);
  });

  it("keeps the streak alive until the current day ends", () => {
    const dates = [new Date("2026-10-21T05:00:00Z"), new Date("2026-10-20T05:00:00Z")];
    expect(currentStreak(dates, "2026-10-22", TZ)).toBe(2);
  });

  it("breaks on a gap and returns zero without activity", () => {
    expect(currentStreak([new Date("2026-10-20T05:00:00Z")], "2026-10-22", TZ)).toBe(0);
    expect(currentStreak([], "2026-10-22", TZ)).toBe(0);
  });
});

describe("weekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartOf("2026-10-22")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
  });
});

describe("weeksOfActivity", () => {
  it("buckets by Monday week, oldest first, including the current week", () => {
    const dates = [
      new Date("2026-10-06T05:00:00Z"),
      new Date("2026-10-20T05:00:00Z"),
      new Date("2026-10-21T05:00:00Z"),
    ];
    const weeks = weeksOfActivity(dates, "2026-10-22", TZ, 3);
    expect(weeks.map((w) => [w.weekStartKey, w.count, w.label])).toEqual([
      ["2026-10-05", 1, "5 Oct"],
      ["2026-10-12", 0, "12 Oct"],
      ["2026-10-19", 2, "19 Oct"],
    ]);
  });
});
