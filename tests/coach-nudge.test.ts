import { describe, expect, it } from "vitest";
import { buildNudge } from "@/lib/coach/nudge";

const now = new Date("2026-10-23T10:00:00Z");
const at = (mins: number) => new Date(now.getTime() + mins * 60_000);
const upcoming = (mins: number, status: "PENDING" | "CONFIRMED" | "IN_PROGRESS" = "CONFIRMED") => ({
  startAt: at(mins),
  category: "Strength training",
  trainerFirstName: "Arjun",
  status,
});

describe("coach nudge", () => {
  it("nudges a pre-session checklist within three hours of a session", () => {
    const n = buildNudge({ upcoming: upcoming(80), finished: null, now });
    expect(n?.kind).toBe("STARTING_SOON");
    expect(n?.title).toContain("1 h 20 min");
    expect(n?.title).toContain("Arjun");
  });

  it("says nothing for a session that is far off or already past", () => {
    expect(buildNudge({ upcoming: upcoming(600), finished: null, now })).toBeNull();
    expect(buildNudge({ upcoming: upcoming(-30), finished: null, now })).toBeNull();
  });

  it("prefers an in-progress session over everything else", () => {
    const n = buildNudge({
      upcoming: upcoming(0, "IN_PROGRESS"),
      finished: { endAt: at(-60), category: "Yoga" },
      now,
    });
    expect(n?.kind).toBe("IN_PROGRESS");
  });

  it("offers recovery tips for 24 hours after a session, then stops", () => {
    const soon = buildNudge({ upcoming: null, finished: { endAt: at(-90), category: "Yoga" }, now });
    expect(soon?.kind).toBe("JUST_FINISHED");
    expect(
      buildNudge({ upcoming: null, finished: { endAt: at(-60 * 25), category: "Yoga" }, now }),
    ).toBeNull();
  });
});
