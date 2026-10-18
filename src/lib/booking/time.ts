import { SLOT_INTERVAL_MINUTES } from "./rules";

/**
 * Time helpers for the booking engine. Instants are UTC `Date`s; "local" always means the service
 * zone's IANA timezone (Asia/Kolkata for every seeded community), never the browser's or server's.
 */
export const MINUTE_MS = 60_000;
const SLOT_MS = SLOT_INTERVAL_MINUTES * MINUTE_MS;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MINUTE_MS);
}

/** Half-open ranges [aStart, aEnd) and [bStart, bEnd) overlap. Back-to-back ranges do not. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Slots sit on 30-minute boundaries. For any zone whose UTC offset is a multiple of 30 minutes
 * (IST is +05:30), local half hours and UTC half hours coincide, so the check works on the instant.
 */
export function isOnSlotGrid(d: Date): boolean {
  return d.getTime() % SLOT_MS === 0;
}

export function ceilToSlot(d: Date): Date {
  return new Date(Math.ceil(d.getTime() / SLOT_MS) * SLOT_MS);
}

export function isValidDateKey(key: string): boolean {
  const m = DATE_KEY_RE.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** "YYYY-MM-DD" of the local calendar day that contains `at`. */
export function localDateKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Local wall-clock offset from UTC, in minutes, at a given instant (IST → 330). */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / MINUTE_MS);
}

/** The UTC instant of local midnight on `dateKey` in `timeZone`. */
export function zonedDayStart(dateKey: string, timeZone: string): Date {
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m || !isValidDateKey(dateKey)) throw new Error(`Invalid date: "${dateKey}"`);
  const wallClock = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let instant = wallClock - zoneOffsetMinutes(new Date(wallClock), timeZone) * MINUTE_MS;
  // A second pass settles zones whose offset changes between the guess and the answer (DST).
  instant = wallClock - zoneOffsetMinutes(new Date(instant), timeZone) * MINUTE_MS;
  return new Date(instant);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) throw new Error(`Invalid date: "${dateKey}"`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** Local minute of the day (0–1439) for an instant. */
export function localMinuteOfDay(at: Date, timeZone: string): number {
  const start = zonedDayStart(localDateKey(at, timeZone), timeZone);
  return Math.round((at.getTime() - start.getTime()) / MINUTE_MS);
}
