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
