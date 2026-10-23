/**
 * The bounded slice of a customer's data the coach may use. Built on the server from the customer's
 * own records only. It leaves out contact details, address, weight
 * and payments; free-text fields the customer volunteered are capped.
 */
export type CoachContext = {
  firstName: string;
  /** "Thu, 22 Oct · 7:40 PM IST", so relative questions ("tomorrow?") can be answered. */
  now: string;
  level: string | null;
  goals: string[];
  intensity: string | null;
  environment: string | null;
  equipment: string[];
  preferences: string[];
  limitations: string | null;
  avoid: string | null;
  /** The next active booking, or the one in progress. */
  nextSession: {
    when: string;
    category: string;
    trainerFirstName: string | null;
    status: "PENDING" | "CONFIRMED" | "IN_PROGRESS";
  } | null;
  upcomingCount: number;
  pkg: { name: string; remaining: number; total: number; validUntil: string | null } | null;
  completedCount: number;
  recentSessions: Array<{ date: string; category: string; trainerSuggestion: string | null }>;
};

const cap = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Labelled lines for the system prompt; every line is data, not instructions. */
export function coachContextToPrompt(c: CoachContext): string {
  const lines = [
    `First name: ${c.firstName}`,
    `Now: ${c.now}`,
    `Fitness level: ${c.level ?? "not set"}`,
    `Goals: ${c.goals.length ? c.goals.join(", ") : "not set"}`,
    `Preferred intensity: ${c.intensity ?? "not set"}`,
    `Trains: ${c.environment ?? "not set"}`,
    `Equipment: ${c.equipment.length ? c.equipment.join(", ") : "none listed"}`,
    `Workout preferences: ${c.preferences.length ? c.preferences.join(", ") : "none listed"}`,
    `Limitations they shared: ${cap(c.limitations, 200) ?? "none"}`,
    `Exercises to avoid: ${cap(c.avoid, 200) ?? "none"}`,
    c.nextSession
      ? `Next session: ${c.nextSession.status === "IN_PROGRESS" ? "in progress now" : c.nextSession.when}, ${c.nextSession.category}${
          c.nextSession.trainerFirstName ? ` with ${c.nextSession.trainerFirstName}` : ", trainer not yet assigned"
        }`
      : "Next session: none booked",
    `Upcoming sessions booked: ${c.upcomingCount}`,
    c.pkg
      ? `Package: ${c.pkg.name}, ${c.pkg.remaining} of ${c.pkg.total} sessions left${c.pkg.validUntil ? `, valid until ${c.pkg.validUntil}` : ""}`
      : "Package: none active (pays per session)",
    `Completed sessions: ${c.completedCount}`,
    ...c.recentSessions.map(
      (s, i) =>
        `Recent session ${i + 1}: ${s.date}, ${s.category}${s.trainerSuggestion ? `; trainer suggested next: ${cap(s.trainerSuggestion, 160)}` : ""}`,
    ),
  ];
  return lines.join("\n");
}
