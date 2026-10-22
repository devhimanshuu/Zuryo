import { addDaysToKey, localDateKey } from "@/lib/booking/time";

/**
 * Activity helpers for the customer's momentum view. Dates are instants; calendar days are always
 * resolved in the service zone's timezone, matching how sessions are shown everywhere else.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type ActivityDay = { dateKey: string; label: string; count: number };
export type ActivityWeek = { weekStartKey: string; label: string; count: number };

function zonedParts(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

export function lastDayKeys(todayKey: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDaysToKey(todayKey, i - (days - 1)));
}

/** One entry per day, oldest first, with counts of the given instants falling on each local day. */
export function activityByDay(dates: Date[], todayKey: string, tz: string, days: number): ActivityDay[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = localDateKey(d, tz);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return lastDayKeys(todayKey, days).map((dateKey) => ({
    dateKey,
    label: WEEKDAYS[zonedParts(dateKey).getUTCDay()]!,
    count: counts.get(dateKey) ?? 0,
  }));
}

/**
 * Consecutive days with at least one activity, ending today. A day that hasn't finished yet never
 * breaks the streak: if today is still empty, the count starts from yesterday.
 */
export function currentStreak(dates: Date[], todayKey: string, tz: string): number {
  const active = new Set(dates.map((d) => localDateKey(d, tz)));
  let cursor = active.has(todayKey) ? todayKey : addDaysToKey(todayKey, -1);
  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

/** Monday of the week that contains the local date. */
export function weekStartOf(dateKey: string): string {
  const day = zonedParts(dateKey).getUTCDay();
  return addDaysToKey(dateKey, -((day + 6) % 7));
}

/** One entry per week, oldest first, including the current (possibly partial) week. */
export function weeksOfActivity(
  dates: Date[],
  todayKey: string,
  tz: string,
  weeks: number,
): ActivityWeek[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = weekStartOf(localDateKey(d, tz));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const currentWeek = weekStartOf(todayKey);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStartKey = addDaysToKey(currentWeek, -7 * (weeks - 1 - i));
    const start = zonedParts(weekStartKey);
    return {
      weekStartKey,
      label: `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`,
      count: counts.get(weekStartKey) ?? 0,
    };
  });
}
