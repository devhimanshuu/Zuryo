/**
 * Minimal RFC 5545 iCalendar writer for a single booking event. Times are emitted in UTC so the
 * file needs no VTIMEZONE block and resolves correctly in any calendar app.
 */

export function escapeIcsText(value: string): string {
  return value.replace(/[\\;,\n\r]/g, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "";
    return `\\${char}`;
  });
}

/** UTC basic format: 20261022T073000Z. */
export function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 folds lines longer than 75 octets with a leading space on the continuation. */
function foldLine(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export type IcsEventInput = {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  now?: Date;
};

export function buildIcsEvent({
  uid,
  title,
  start,
  end,
  description,
  location,
  now = new Date(),
}: IcsEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zuryo//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
