/**
 * A proactive prompt shown at the top of the coach when something about the customer's training is
 * happening right now: a session starting soon, one in progress, or one that just finished. Built
 * from times the customer already sees in the app; pure so it can be tested without a database.
 */
export type CoachNudge = {
  kind: "STARTING_SOON" | "IN_PROGRESS" | "JUST_FINISHED";
  title: string;
  detail: string;
  /** Sent to the coach when the customer taps the call to action. */
  prompt: string;
  cta: string;
};

export type NudgeInput = {
  upcoming: {
    startAt: Date;
    category: string;
    trainerFirstName: string | null;
    status: "PENDING" | "CONFIRMED" | "IN_PROGRESS";
  } | null;
  finished: { endAt: Date; category: string } | null;
  now: Date;
};

const HOUR = 3_600_000;

function until(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function buildNudge({ upcoming, finished, now }: NudgeInput): CoachNudge | null {
  if (upcoming?.status === "IN_PROGRESS") {
    return {
      kind: "IN_PROGRESS",
      title: `Your ${upcoming.category} session is under way`,
      detail: "Ask for a quick form or breathing reminder while you train.",
      prompt: `Give me quick form and breathing reminders for my ${upcoming.category} session.`,
      cta: "Quick reminders",
    };
  }
  if (upcoming) {
    const ms = upcoming.startAt.getTime() - now.getTime();
    if (ms > 0 && ms <= 3 * HOUR) {
      const trainer = upcoming.trainerFirstName ? ` with ${upcoming.trainerFirstName}` : "";
      return {
        kind: "STARTING_SOON",
        title: `${upcoming.category}${trainer} starts in ${until(ms)}`,
        detail: "Get a short pre-session checklist: warm-up, fuel and what to bring.",
        prompt: `Give me a short pre-session checklist for my ${upcoming.category} session in ${until(ms)}: warm-up, what to eat and what to bring.`,
        cta: "Pre-session checklist",
      };
    }
  }
  if (finished) {
    const ms = now.getTime() - finished.endAt.getTime();
    if (ms >= 0 && ms <= 24 * HOUR) {
      return {
        kind: "JUST_FINISHED",
        title: `Nice work on your ${finished.category} session`,
        detail: "Get recovery tips for the next 24 hours.",
        prompt: `How should I recover after my ${finished.category} session today?`,
        cta: "Recovery tips",
      };
    }
  }
  return null;
}
