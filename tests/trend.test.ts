import { describe, expect, it } from "vitest";
import { dailySeries, sparklinePaths } from "@/lib/trend";

const TZ = "Asia/Kolkata";

describe("dailySeries", () => {
  it("sums values into local days and keeps empty days", () => {
    const points = [
      { at: new Date("2026-10-22T05:00:00Z"), value: 1 },
      { at: new Date("2026-10-21T20:00:00Z"), value: 2 },
      { at: new Date("2026-10-22T07:00:00Z"), value: 10.5 },
    ];
    const series = dailySeries(points, "2026-10-22", TZ, 3);
    expect(series.map((p) => [p.dateKey, p.value])).toEqual([
      ["2026-10-20", 0],
      ["2026-10-21", 0],
      ["2026-10-22", 13.5],
    ]);
    expect(series[2]!.label).toBe("22 Oct");
  });

  it("ignores values outside the window", () => {
    const series = dailySeries([{ at: new Date("2026-10-01T05:00:00Z"), value: 9 }], "2026-10-22", TZ, 2);
    expect(series.map((p) => p.value)).toEqual([0, 0]);
  });
});

describe("sparklinePaths", () => {
  it("returns empty paths for no data", () => {
    expect(sparklinePaths([])).toEqual({ line: "", area: "" });
  });

  it("scales values into the view box and closes the area", () => {
    const { line, area } = sparklinePaths([0, 5, 10], 100, 32);
    expect(line.startsWith("M0.00 ")).toBe(true);
    expect(line).toContain("L100.00 ");
    expect(area).toBe(`${line} L100 32 L0 32 Z`);
    const ys = line.match(/[ML]\d+\.\d+ (\d+\.\d+)/g) ?? [];
    expect(ys).toHaveLength(3);
    expect(Number(ys[0]!.split(" ")[1])).toBeGreaterThan(Number(ys[2]!.split(" ")[1]));
  });
});
