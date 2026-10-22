import { localDateKey } from "@/lib/booking/time";
import { lastDayKeys } from "@/lib/activity";

/** Daily trend series for dashboards. Values are bucketed by local calendar day and summed. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type TrendSource = { at: Date; value: number };
export type TrendPoint = { dateKey: string; label: string; value: number };

function dayLabel(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function dailySeries(points: TrendSource[], todayKey: string, tz: string, days: number): TrendPoint[] {
  const sums = new Map<string, number>();
  for (const p of points) {
    const key = localDateKey(p.at, tz);
    sums.set(key, (sums.get(key) ?? 0) + p.value);
  }
  return lastDayKeys(todayKey, days).map((dateKey) => ({
    dateKey,
    label: dayLabel(dateKey),
    value: Math.round((sums.get(dateKey) ?? 0) * 100) / 100,
  }));
}

/**
 * SVG paths for a sparkline in a 0..width / 0..height box. Coordinates are percentages of the
 * viewBox, so the caller can stretch the SVG without recomputing anything.
 */
export function sparklinePaths(
  values: number[],
  width = 100,
  height = 32,
  padding = 3,
): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(1, ...values);
  const usable = height - padding * 2;
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);
  const y = (v: number) => height - padding - (Math.max(0, v) / max) * usable;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  return { line, area: `${line} L${width} ${height} L0 ${height} Z` };
}
