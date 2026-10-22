import { canArriveBy, type TravelEstimate } from "@/lib/location/travel";
import type { WorkoutCategory } from "@/lib/validation/enums";
import { checkTrainerFree, sessionEnd, type BusyReason, type TrainerSchedule } from "./availability";
import { WORKOUT_CATEGORY_INFO } from "./categories";
import { isActiveStatus } from "./rules";
import { addDaysToKey, localDateKey, overlaps, zonedDayStart } from "./time";

/**
 * Deterministic, explainable trainer matching. No ratings, no AI: a trainer is eligible when they
 * are active, coach the requested category, are free for the whole session and (when the caller
 * says when they'd set out) can reach the community by the start. Eligible trainers are ordered by
 *   1. primary focus: the category is the first one they list,
 *   2. nearer: estimated travel from their base, in TRAVEL_BAND_MINUTES bands so a minute or two
 *      doesn't outweigh a lighter day; trainers without a location sort after those with one,
 *   3. lighter day: fewer active sessions on that local day (spreads work across trainers),
 *   4. trainer id: a fixed tie-breaker, so the same inputs always give the same order.
 * For instant bookings the earliest start that has any eligible trainer wins before this ordering.
 */
export const MATCHING_EXPLANATION =
  "Trainers are matched if they coach this workout, are free for the full hour and can reach your community in time. We list those whose primary focus it is first, then the nearest, then whoever has the lighter day. Ties always resolve the same way.";

/** Travel times within one band count as equally near. */
export const TRAVEL_BAND_MINUTES = 5;

export type TrainerCandidate = {
  trainerId: string;
  name: string;
  isActive: boolean;
  /** First entry is the trainer's primary focus. */
  categories: WorkoutCategory[];
  schedule: TrainerSchedule;
  /** Estimated trip from the trainer's base to the community; null when they have no location. */
  travel?: TravelEstimate | null;
};

export type RankedTrainer = {
  trainerId: string;
  name: string;
  /** 1 = recommended. */
  rank: number;
  primaryFocus: boolean;
  sessionsThatDay: number;
  travel: TravelEstimate | null;
  reasons: string[];
};

export type MatchCriteria = {
  category: WorkoutCategory;
  startAt: Date;
  timeZone: string;
  /** When set, a trainer must be able to set out at this time and still arrive by the start. */
  departFrom?: Date;
};

export type IneligibleReason = "INACTIVE" | "CATEGORY" | BusyReason | "OUT_OF_REACH";

export function ineligibility(candidate: TrainerCandidate, c: MatchCriteria): IneligibleReason | null {
  if (!candidate.isActive) return "INACTIVE";
  if (!candidate.categories.includes(c.category)) return "CATEGORY";
  const check = checkTrainerFree(candidate.schedule, c.startAt, sessionEnd(c.startAt));
  if (!check.free) return check.reason;
  if (c.departFrom && candidate.travel && !canArriveBy(candidate.travel, c.departFrom, c.startAt)) {
    return "OUT_OF_REACH";
  }
  return null;
}

export const INELIGIBLE_MESSAGE: Record<IneligibleReason, string> = {
  INACTIVE: "This trainer isn't taking bookings right now.",
  CATEGORY: "This trainer doesn't coach that workout type.",
  NO_AVAILABILITY: "This trainer hasn't opened availability for that time.",
  BLOCKED: "This trainer has blocked off that time.",
  BOOKED: "This trainer already has a session at that time.",
  OUT_OF_REACH: "This trainer can't reach your community in time for that start.",
};

const travelBand = (t: TravelEstimate | null) =>
  t ? Math.ceil(t.travelMinutes / TRAVEL_BAND_MINUTES) : Number.MAX_SAFE_INTEGER;

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
      travel: t.travel ?? null,
    }))
    .sort(
      (a, b) =>
        Number(b.primaryFocus) - Number(a.primaryFocus) ||
        travelBand(a.travel) - travelBand(b.travel) ||
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
  /** Now, for instant bookings: only trainers who can get there by a start count for it. */
  departFrom?: Date,
): { startAt: Date; trainers: RankedTrainer[] } | null {
  for (const startAt of [...starts].sort((a, b) => a.getTime() - b.getTime())) {
    const trainers = rankTrainers(candidates, { category, startAt, timeZone, departFrom });
    if (trainers.length > 0) return { startAt, trainers };
  }
  return null;
}
