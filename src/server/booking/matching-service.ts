import "server-only";
import {
  hasActiveOverlap,
  instantCandidateStarts,
  sessionEnd,
  startTimeProblem,
} from "@/lib/booking/availability";
import { categoryLabel } from "@/lib/booking/categories";
import {
  MATCHING_EXPLANATION,
  findEarliestMatch,
  rankTrainers,
  type RankedTrainer,
} from "@/lib/booking/matching";
import { quoteSession, type PriceQuote } from "@/lib/booking/pricing";
import { addMinutes } from "@/lib/booking/time";
import { formatSlot } from "@/lib/utils/format";
import type { BookingMode, WorkoutCategory } from "@/lib/validation/enums";
import {
  dayRange,
  findAlternatives,
  loadCandidatePool,
  loadCustomerBookings,
  type CustomerContext,
  type TrainerProfileView,
} from "./availability-service";
import type { BookingDeps } from "./deps";
import { fail, ok, type ServiceResult } from "./errors";
import { loadActivePricing } from "./pricing-service";

export type MatchedTrainer = RankedTrainer & Omit<TrainerProfileView, "trainerId" | "name">;

/** The server's answer to "who can train me at this time, and what will it cost?" */
export type MatchResult = {
  mode: BookingMode;
  category: WorkoutCategory;
  startAt: string;
  endAt: string;
  timeZone: string;
  trainers: MatchedTrainer[];
  quote: PriceQuote;
  explanation: string;
};

function withProfiles(ranked: RankedTrainer[], profiles: Map<string, TrainerProfileView>): MatchedTrainer[] {
  return ranked.map((r) => {
    const p = profiles.get(r.trainerId);
    return {
      ...r,
      bio: p?.bio ?? null,
      specializations: p?.specializations ?? [],
      experienceYears: p?.experienceYears ?? null,
      categories: p?.categories ?? [],
    };
  });
}

/** Ranked, eligible trainers for one start time. Used after a customer picks a scheduled slot. */
export async function getMatches(
  deps: BookingDeps,
  customer: CustomerContext,
  args: { category: WorkoutCategory; startAt: Date; mode: BookingMode },
): Promise<ServiceResult<MatchResult>> {
  const now = deps.now();
  const problem = startTimeProblem(args.mode, args.startAt, now);
  if (problem) return fail("VALIDATION", problem, { fieldErrors: { startAt: [problem] } });

  const tz = customer.timeZone;
  const { from, to } = dayRange(args.startAt, tz);
  const [pool, customerBookings, pricing] = await Promise.all([
    loadCandidatePool(deps.db, {
      serviceZoneId: customer.serviceZoneId,
      category: args.category,
      from,
      to,
      destination: customer.location,
    }),
    loadCustomerBookings(deps.db, customer.userId, from, to),
    loadActivePricing(deps.db, now),
  ]);

  if (hasActiveOverlap(customerBookings, args.startAt, sessionEnd(args.startAt))) {
    return fail("CONFLICT", "You already have a session that overlaps this time.", {
      alternatives: await findAlternatives(deps, customer, args.category, args.startAt),
    });
  }

  const ranked = rankTrainers(pool.candidates, {
    category: args.category,
    startAt: args.startAt,
    timeZone: tz,
    departFrom: now,
  });
  if (ranked.length === 0) {
    return fail(
      "NO_TRAINER",
      `No trainer is free for ${categoryLabel(args.category).toLowerCase()} at ${formatSlot(args.startAt, tz)}.`,
      { alternatives: await findAlternatives(deps, customer, args.category, args.startAt) },
    );
  }

  return ok({
    mode: args.mode,
    category: args.category,
    startAt: args.startAt.toISOString(),
    endAt: sessionEnd(args.startAt).toISOString(),
    timeZone: tz,
    trainers: withProfiles(ranked, pool.profiles),
    quote: quoteSession(pricing, args.startAt, tz),
    explanation: MATCHING_EXPLANATION,
  });
}

/**
 * The earliest instant session: the first start between now + 15 min and now + 60 min with an
 * eligible trainer who can also travel there by then (setting out now). When nobody can start
 * within the hour the result says so and suggests the nearest scheduled slots instead; it never
 * pretends someone is instantly available.
 */
export async function getInstantOffer(
  deps: BookingDeps,
  customer: CustomerContext,
  category: WorkoutCategory,
): Promise<ServiceResult<MatchResult>> {
  const now = deps.now();
  const tz = customer.timeZone;
  const starts = instantCandidateStarts(now);
  const from = starts[0] ?? now;
  const { from: dayFrom, to: dayTo } = dayRange(from, tz);
  const to = addMinutes(starts.at(-1) ?? now, 120);
  const range = { from: dayFrom < from ? dayFrom : from, to: dayTo > to ? dayTo : to };

  const [pool, customerBookings, pricing] = await Promise.all([
    loadCandidatePool(deps.db, {
      serviceZoneId: customer.serviceZoneId,
      category,
      ...range,
      destination: customer.location,
    }),
    loadCustomerBookings(deps.db, customer.userId, range.from, range.to),
    loadActivePricing(deps.db, now),
  ]);

  const open = starts.filter((s) => !hasActiveOverlap(customerBookings, s, sessionEnd(s)));
  const match = findEarliestMatch(pool.candidates, category, open, tz, now);
  if (!match) {
    return fail(
      "NO_TRAINER",
      open.length < starts.length
        ? "You already have a session within the next hour, so an instant booking isn't possible."
        : `No ${categoryLabel(category).toLowerCase()} trainer can start within the next hour.`,
      { alternatives: await findAlternatives(deps, customer, category, now) },
    );
  }

  return ok({
    mode: "INSTANT",
    category,
    startAt: match.startAt.toISOString(),
    endAt: sessionEnd(match.startAt).toISOString(),
    timeZone: tz,
    trainers: withProfiles(match.trainers, pool.profiles),
    quote: quoteSession(pricing, match.startAt, tz),
    explanation: MATCHING_EXPLANATION,
  });
}
