const IST_OFFSET_MIN = 330;
const TZ = "Asia/Kolkata";

/** Midnight (IST) of the IST calendar day containing `at`, as a UTC instant. */
export function istMidnight(at: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(at)
    .split("-")
    .map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MIN * 60_000);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
