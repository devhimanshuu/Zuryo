import type { WorkoutCategory } from "@/lib/validation/enums";
import { checkTrainerFree, sessionEnd, type BusyReason, type TrainerSchedule } from "./availability";
import { WORKOUT_CATEGORY_INFO } from "./categories";
import { isActiveStatus } from "./rules";
import { addDaysToKey, localDateKey, overlaps, zonedDayStart } from "./time";

/**
 * Deterministic, explainable trainer matching. No ratings, no AI: a trainer is eligible when they
 * are active, coach the requested category and are free for the whole session. Eligible trainers
 * are ordered by
 *   1. primary focus: the category is the first one they list,
 *   2. lighter day: fewer active sessions on that local day (spreads work across trainers),
 *   3. trainer id: a fixed tie-breaker, so the same inputs always give the same order.
 * For instant bookings the earliest start that has any eligible trainer wins before this ordering.
 */
export const MATCHING_EXPLANATION =
  "Trainers are matched if they coach this workout and are free for the full hour. We list those whose primary focus it is first, then whoever has the lighter day. Ties always resolve the same way.";

export type TrainerCandidate = {
  trainerId: string;
  name: string;
  isActive: boolean;
  /** First entry is the trainer's primary focus. */
  categories: WorkoutCategory[];
  schedule: TrainerSchedule;
};

export type RankedTrainer = {
  trainerId: string;
  name: string;
  /** 1 = recommended. */
  rank: number;
  primaryFocus: boolean;
  sessionsThatDay: number;
  reasons: string[];
};

export type MatchCriteria = { category: WorkoutCategory; startAt: Date; timeZone: string };

export type IneligibleReason = "INACTIVE" | "CATEGORY" | BusyReason;

export function ineligibility(candidate: TrainerCandidate, c: MatchCriteria): IneligibleReason | null {
  if (!candidate.isActive) return "INACTIVE";
  if (!candidate.categories.includes(c.category)) return "CATEGORY";
  const check = checkTrainerFree(candidate.schedule, c.startAt, sessionEnd(c.startAt));
  return check.free ? null : check.reason;
}

export const INELIGIBLE_MESSAGE: Record<IneligibleReason, string> = {
  INACTIVE: "This trainer isn't taking bookings right now.",
  CATEGORY: "This trainer doesn't coach that workout type.",
  NO_AVAILABILITY: "This trainer hasn't opened availability for that time.",
  BLOCKED: "This trainer has blocked off that time.",
  BOOKED: "This trainer already has a session at that time.",
};

function sessionsOnLocalDay(schedule: TrainerSchedule, startAt: Date, timeZone: string): number {
  const key = localDateKey(startAt, timeZone);
  const dayStart = zonedDayStart(key, timeZone);
  const dayEnd = zonedDayStart(addDaysToKey(key, 1), timeZone);
  return schedule.bookings.filter(
    (b) => isActiveStatus(b.status) && overlaps(b.startAt, b.endAt, dayStart, dayEnd),
  ).length;
}

export function rankTrainers(candidates: TrainerCandidate[], c: MatchCriteria): RankedTrainer[] {
  const label = WORKOUT_CATEGORY_INFO[c.category].label;
  return candidates
    .filter((t) => ineligibility(t, c) === null)
    .map((t) => ({
      trainerId: t.trainerId,
      name: t.name,
      primaryFocus: t.categories[0] === c.category,
      sessionsThatDay: sessionsOnLocalDay(t.schedule, c.startAt, c.timeZone),
    }))
    .sort(
      (a, b) =>
        Number(b.primaryFocus) - Number(a.primaryFocus) ||
        a.sessionsThatDay - b.sessionsThatDay ||
        (a.trainerId < b.trainerId ? -1 : a.trainerId > b.trainerId ? 1 : 0),
    )
    .map((t, i) => ({
      ...t,
      rank: i + 1,
      reasons: [
        t.primaryFocus ? `${label} is their primary focus` : `Also coaches ${label.toLowerCase()}`,
        "Free for the full 60 minutes",
        t.sessionsThatDay === 0
          ? "No other sessions that day"
          : `${t.sessionsThatDay} other session${t.sessionsThatDay === 1 ? "" : "s"} that day`,
      ],
    }));
}

/** Earliest of the given starts that has at least one eligible trainer, with the ranking at that start. */
export function findEarliestMatch(
  candidates: TrainerCandidate[],
  category: WorkoutCategory,
  starts: Date[],
  timeZone: string,
): { startAt: Date; trainers: RankedTrainer[] } | null {
  for (const startAt of [...starts].sort((a, b) => a.getTime() - b.getTime())) {
    const trainers = rankTrainers(candidates, { category, startAt, timeZone });
    if (trainers.length > 0) return { startAt, trainers };
  }
  return null;
}
