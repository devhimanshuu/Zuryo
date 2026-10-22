import { describe, expect, it } from "vitest";
import { dateParts, initials, relativeDay } from "@/lib/utils/format";

describe("display formatting helpers", () => {
  it("splits a date into tile parts in the zone, not UTC", () => {
    // 20:00 UTC on 22 Oct is 01:30 on 23 Oct in IST.
    expect(dateParts(new Date("2026-10-22T20:00:00Z"))).toEqual({ day: "23", month: "Oct", weekday: "Fri" });
  });

  it("labels future days by calendar day in the zone", () => {
    const now = new Date("2026-10-22T17:00:00Z"); // 22:30 IST, Thu 22 Oct
    expect(relativeDay(new Date("2026-10-22T17:30:00Z"), now)).toBe("Today");
    expect(relativeDay(new Date("2026-10-22T19:00:00Z"), now)).toBe("Tomorrow"); // 00:30 IST, Fri 23 Oct
    expect(relativeDay(new Date("2026-10-25T04:00:00Z"), now)).toBe("In 3 days");
  });

  it("makes at most two initials from a name", () => {
    expect(initials("Priya Sharma")).toBe("PS");
    expect(initials("  neha  kapoor rao ")).toBe("NK");
    expect(initials("Alice")).toBe("A");
  });
});
