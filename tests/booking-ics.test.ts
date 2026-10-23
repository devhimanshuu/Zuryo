import { describe, expect, it } from "vitest";
import { buildIcsEvent, escapeIcsText, icsStamp } from "@/lib/booking/ics";

describe("escapeIcsText", () => {
  it("escapes separators, backslashes and newlines", () => {
    expect(escapeIcsText("Yoga, strength; notes\\more")).toBe("Yoga\\, strength\\; notes\\\\more");
    expect(escapeIcsText("line one\nline two\r\nline three")).toBe("line one\\nline two\\nline three");
  });
});

describe("icsStamp", () => {
  it("formats UTC basic timestamps", () => {
    expect(icsStamp(new Date("2026-10-22T07:30:00.000Z"))).toBe("20261022T073000Z");
  });
});

describe("buildIcsEvent", () => {
  const ics = buildIcsEvent({
    uid: "booking-123@zuryofit",
    title: "Strength with Asha, Trainer",
    start: new Date("2026-10-22T07:30:00.000Z"),
    end: new Date("2026-10-22T08:30:00.000Z"),
    description: "ZuryoFit booking ZY-ABCDE",
    location: "Green Meadows, Tower B, 402",
    now: new Date("2026-10-20T10:00:00.000Z"),
  });

  it("wraps a single VEVENT with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:booking-123@zuryofit\r\n");
    expect(ics).toContain("DTSTART:20261022T073000Z\r\n");
    expect(ics).toContain("DTEND:20261022T083000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261020T100000Z\r\n");
  });

  it("escapes text fields", () => {
    expect(ics).toContain("SUMMARY:Strength with Asha\\, Trainer\r\n");
    expect(ics).toContain("LOCATION:Green Meadows\\, Tower B\\, 402\r\n");
  });
});
