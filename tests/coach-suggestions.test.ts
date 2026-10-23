import { describe, expect, it } from "vitest";
import type { CoachContext } from "@/lib/coach/context";
import { generateSmartSuggestions } from "@/lib/coach/suggestions";

const sampleCtx: CoachContext = {
  firstName: "Priya",
  now: "Thu, 22 Oct · 7:40 PM IST",
  level: "Intermediate",
  goals: ["Strength", "Weight loss"],
  intensity: "Moderate",
  environment: "Home",
  equipment: ["Mat", "Dumbbells"],
  preferences: ["Morning"],
  limitations: "Tight shoulders",
  avoid: null,
  nextSession: {
    when: "Fri, 23 Oct · 10:00 AM",
    category: "Strength training",
    trainerFirstName: "Arjun",
    status: "CONFIRMED",
  },
  upcomingCount: 1,
  pkg: { name: "Fitness Pack", remaining: 6, total: 10, validUntil: "Tue, 5 Jan" },
  completedCount: 3,
  recentSessions: [
    { date: "Mon, 19 Oct", category: "Cardio", trainerSuggestion: "Lower-body strength next" },
  ],
};

describe("generateSmartSuggestions", () => {
  it("generates personalized suggestions based on next session and package", () => {
    const suggestions = generateSmartSuggestions(sampleCtx);
    expect(suggestions.length).toBeGreaterThan(4);

    const warmup = suggestions.find((s) => s.category === "WARMUP" && s.badge === "Next session");
    expect(warmup?.text).toContain("Arjun");
    expect(warmup?.text).toContain("Strength training");

    const pkgSuggestion = suggestions.find((s) => s.badge === "Package");
    expect(pkgSuggestion?.text).toContain("Fitness Pack");

    const trainerSuggestion = suggestions.find((s) => s.badge === "Trainer note");
    expect(trainerSuggestion?.text).toContain("Lower-body strength next");
  });

  it("handles null context gracefully with standard fallbacks", () => {
    const suggestions = generateSmartSuggestions(null);
    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    expect(suggestions.some((s) => s.category === "WARMUP")).toBe(true);
    expect(suggestions.some((s) => s.category === "RECOVERY")).toBe(true);
    expect(suggestions.some((s) => s.category === "NUTRITION")).toBe(true);
  });
});
