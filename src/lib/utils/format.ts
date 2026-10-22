/** Display formatting. All times show in the service zone's timezone (IST for every seeded zone). */
export const DEFAULT_TZ = "Asia/Kolkata";

export function formatDay(d: Date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export function formatTime(d: Date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .toUpperCase();
}

export function formatSlot(start: Date, tz = DEFAULT_TZ) {
  return `${formatDay(start, tz)} · ${formatTime(start, tz)}`;
}

/** "Thu, 22 Oct · 7:40 PM IST" — keeps the coach's sense of "today" and "tomorrow" grounded. */
export function formatCoachNow(d: Date, tz = DEFAULT_TZ) {
  const zone =
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${formatSlot(d, tz)}${zone ? ` ${zone}` : ""}`;
}

export function minutesToClock(minute: number) {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function formatDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  if (contiguous && sorted.length > 2) return `${DAY_NAMES[sorted[0]! - 1]}–${DAY_NAMES[sorted.at(-1)! - 1]}`;
  return sorted.map((d) => DAY_NAMES[d - 1]).join(", ");
}

export function greeting(now = new Date(), tz = DEFAULT_TZ) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function titleCase(enumValue: string) {
  return enumValue.charAt(0) + enumValue.slice(1).toLowerCase().replaceAll("_", " ");
}

/** Day-of-month, short month and weekday for calendar-style date tiles. */
export function dateParts(d: Date, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), weekday: get("weekday") };
}

/** "Today", "Tomorrow" or "In N days" for a future instant, by calendar day in the zone. */
export function relativeDay(d: Date, now = new Date(), tz = DEFAULT_TZ) {
  const key = (x: Date) =>
    Date.parse(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(x),
    );
  const days = Math.round((key(d) - key(now)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** Up to two initials from a display name, for avatars. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 2);
}
