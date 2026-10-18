export type PeakWindowLike = { daysOfWeek: number[]; startMinute: number; endMinute: number };

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Local ISO weekday (1–7) and minute-of-day for an instant in a given IANA timezone. */
export function localWeekdayAndMinute(at: Date, timeZone: string): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: WEEKDAY[get("weekday")] ?? 0, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** A session is peak when its start time falls inside any peak window (start inclusive, end exclusive). */
export function isPeakStart(startAt: Date, windows: PeakWindowLike[], timeZone: string): boolean {
  const { weekday, minute } = localWeekdayAndMinute(startAt, timeZone);
  return windows.some(
    (w) => w.daysOfWeek.includes(weekday) && minute >= w.startMinute && minute < w.endMinute,
  );
}
