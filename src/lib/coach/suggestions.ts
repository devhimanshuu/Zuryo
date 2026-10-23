import type { CoachContext } from "./context";

export type SuggestionCategory = "ALL" | "WARMUP" | "RECOVERY" | "NUTRITION" | "HABITS" | "MY_ZURYO";

export type SmartSuggestion = {
  id: string;
  category: SuggestionCategory;
  text: string;
  badge?: string;
};

export const SUGGESTION_CATEGORIES: Array<{ key: SuggestionCategory; label: string }> = [
  { key: "ALL", label: "Featured" },
  { key: "WARMUP", label: "Warm-ups" },
  { key: "RECOVERY", label: "Recovery" },
  { key: "NUTRITION", label: "Nutrition" },
  { key: "HABITS", label: "Habits" },
  { key: "MY_ZURYO", label: "My Zuryo" },
];

/**
 * Builds smart, personalized prompts based on the customer's live profile, upcoming session,
 * package status, and recent trainer suggestions.
 */
export function generateSmartSuggestions(ctx: CoachContext | null): SmartSuggestion[] {
  const list: SmartSuggestion[] = [];

  if (ctx?.nextSession) {
    const trainerPart = ctx.nextSession.trainerFirstName ? ` with ${ctx.nextSession.trainerFirstName}` : "";
    list.push({
      id: "next-warmup",
      category: "WARMUP",
      text: `How should I warm up for my ${ctx.nextSession.category} session${trainerPart}?`,
      badge: "Next session",
    });
    list.push({
      id: "next-fuel",
      category: "NUTRITION",
      text: `What should I eat before my ${ctx.nextSession.category} session?`,
      badge: "Pre-workout",
    });
  }

  if (ctx?.recentSessions && ctx.recentSessions.length > 0) {
    const recent = ctx.recentSessions[0];
    if (recent) {
      list.push({
        id: "recent-recovery",
        category: "RECOVERY",
        text: `How do I recover from my recent ${recent.category} workout?`,
        badge: "Recent session",
      });
      if (recent.trainerSuggestion) {
        list.push({
          id: "trainer-suggestion",
          category: "MY_ZURYO",
          text: `Tell me more about the trainer's tip: "${recent.trainerSuggestion}"`,
          badge: "Trainer note",
        });
      }
    }
  }

  if (ctx?.pkg) {
    list.push({
      id: "package-balance",
      category: "MY_ZURYO",
      text: `How many sessions are left in my ${ctx.pkg.name}?`,
      badge: "Package",
    });
  }

  const primaryGoal = ctx?.goals?.[0];
  if (primaryGoal) {
    list.push({
      id: "goal-habits",
      category: "HABITS",
      text: `What daily habits will help reach my ${primaryGoal} goal?`,
      badge: "My goal",
    });
  }

  if (ctx?.limitations) {
    list.push({
      id: "limitations-warmup",
      category: "WARMUP",
      text: `What exercises or stretches are safe given my note: "${ctx.limitations}"?`,
      badge: "Personalized",
    });
  }

  // Curated fallbacks to guarantee rich options for each category
  const standards: SmartSuggestion[] = [
    {
      id: "std-warmup",
      category: "WARMUP",
      text: "How should I warm up before strength training?",
    },
    {
      id: "std-recovery",
      category: "RECOVERY",
      text: "What is the best post-workout routine to prevent soreness?",
    },
    {
      id: "std-nutrition",
      category: "NUTRITION",
      text: "How much protein and hydration should I aim for on training days?",
    },
    {
      id: "std-habits",
      category: "HABITS",
      text: "How can I stay consistent when I have a busy schedule?",
    },
    {
      id: "std-consistency",
      category: "MY_ZURYO",
      text: "Can you review my fitness profile and suggest my next step?",
    },
  ];

  // Merge unique by text
  const seen = new Set<string>();
  const results: SmartSuggestion[] = [];

  for (const item of [...list, ...standards]) {
    if (!seen.has(item.text)) {
      seen.add(item.text);
      results.push(item);
    }
  }

  return results;
}
