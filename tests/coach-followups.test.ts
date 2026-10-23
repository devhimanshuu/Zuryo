import { describe, expect, it } from "vitest";
import { followUpsFor } from "@/lib/coach/followups";

describe("coach follow-ups", () => {
  it("offers topic-specific questions for an answered reply", () => {
    const r = followUpsFor("Hydrate well and have some protein after training.", "ANSWERED");
    expect(r.prompts).toHaveLength(3);
    expect(r.prompts.join(" ")).toMatch(/eat|water|vegetarian/i);
  });

  it("adds app links when the reply is about bookings or packages", () => {
    const r = followUpsFor(
      "You have 6 sessions left in your Fitness Pack. Book your next session soon.",
      "ANSWERED",
    );
    const hrefs = r.links.map((l) => l.href);
    expect(hrefs).toContain("/customer/bookings/new");
    expect(r.links.length).toBeLessThanOrEqual(2);
  });

  it("stays quiet after safety, medical and out-of-scope replies", () => {
    for (const route of ["SAFETY", "MEDICAL", "OUT_OF_SCOPE"] as const) {
      expect(followUpsFor("Please see a doctor before your next session.", route)).toEqual({
        prompts: [],
        links: [],
      });
    }
  });

  it("falls back to workout questions for anything else", () => {
    expect(followUpsFor("Keep your back straight.", "ANSWERED").prompts.length).toBe(3);
  });
});
