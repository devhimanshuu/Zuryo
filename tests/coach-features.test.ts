import { describe, expect, it } from "vitest";
import { generateSmartSuggestions } from "@/lib/coach/suggestions";
import type { CoachContext } from "@/lib/coach/context";

describe("coach dynamic smart suggestions", () => {
  it("prioritizes next session warmups and pre-workout fueling", () => {
    const ctx: CoachContext = {
      firstName: "Aarav",
      now: "Fri, 24 Oct · 6:00 PM IST",
      level: "Intermediate",
      goals: ["Strength"],
      intensity: "High",
      environment: "Home",
      equipment: ["Dumbbells"],
      preferences: ["Evening"],
      limitations: "Lower back sensitivity",
      avoid: null,
      nextSession: {
        when: "Sat, 25 Oct · 7:00 AM",
        category: "Yoga & mobility",
        trainerFirstName: "Neha",
        status: "CONFIRMED",
      },
      upcomingCount: 2,
      pkg: { name: "Pro Pack", remaining: 4, total: 8, validUntil: "Sun, 30 Nov" },
      completedCount: 5,
      recentSessions: [
        { date: "Wed, 22 Oct", category: "Strength", trainerSuggestion: "Focus on hamstring flexibility" },
      ],
    };

    const suggestions = generateSmartSuggestions(ctx);

    // Should include trainer-specific warmup
    const warmup = suggestions.find((s) => s.id === "next-warmup");
    expect(warmup).toBeDefined();
    expect(warmup?.text).toContain("Yoga & mobility");
    expect(warmup?.text).toContain("Neha");
    expect(warmup?.badge).toBe("Next session");

    // Should include limitation consideration
    const limitation = suggestions.find((s) => s.id === "limitations-warmup");
    expect(limitation).toBeDefined();
    expect(limitation?.text).toContain("Lower back sensitivity");

    // Should include trainer tip follow-up
    const trainerTip = suggestions.find((s) => s.id === "trainer-suggestion");
    expect(trainerTip).toBeDefined();
    expect(trainerTip?.text).toContain("Focus on hamstring flexibility");
  });
});
