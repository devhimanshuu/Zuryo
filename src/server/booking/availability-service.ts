import "server-only";
import {
  hasActiveOverlap,
  scheduledTiming,
  serviceDayStarts,
  sessionEnd,
  type BookingIntervalLike,
} from "@/lib/booking/availability";
import { ineligibility, type TrainerCandidate } from "@/lib/booking/matching";
import { quoteSession, type ActivePricing } from "@/lib/booking/pricing";
import { ACTIVE_BOOKING_STATUSES, BOOKING_HORIZON_DAYS } from "@/lib/booking/rules";
import { addDaysToKey, localDateKey, zonedDayStart } from "@/lib/booking/time";
import type { WorkoutCategory } from "@/lib/validation/enums";
import type { BookingDeps, DbOrTx } from "./deps";
import type { SlotSuggestion } from "./errors";
import { loadActivePricing } from "./pricing-service";

/** The customer a booking is for, with the community whose timezone and trainers apply. */
export type CustomerContext = {
  userId: string;
  name: string;
  addressLine: string | null;
  serviceZoneId: string;
  zoneName: string;
  timeZone: string;
};

export async function loadCustomerContext(db: DbOrTx, userId: string): Promise<CustomerContext | null> {
  const p = await db.customerProfile.findFirst({
    where: { userId, user: { status: "ACTIVE" } },
    select: {
      userId: true,
      addressLine: true,
      serviceZoneId: true,
      user: { select: { name: true } },
      serviceZone: { select: { name: true, timezone: true, isActive: true } },
    },
  });
  if (!p || !p.serviceZone.isActive) return null;
  return {
    userId: p.userId,
    name: p.user.name,
    addressLine: p.addressLine,
    serviceZoneId: p.serviceZoneId,
    zoneName: p.serviceZone.name,
    timeZone: p.serviceZone.timezone,
  };
}

export type TrainerProfileView = {
  trainerId: string;
  name: string;
  bio: string | null;
  specializations: string[];
  experienceYears: number | null;
  categories: WorkoutCategory[];
};

export type CandidatePool = {
  candidates: TrainerCandidate[];
  profiles: Map<string, TrainerProfileView>;
};

/**
 * Trainers in the customer's community who coach `category`, with their availability windows and
 * active bookings over [from, to). Inactive trainers and suspended users are excluded here and
 * re-checked under lock when a booking is written.
 */
export async function loadCandidatePool(
  db: DbOrTx,
  args: {
    serviceZoneId: string;
    category: WorkoutCategory;
    from: Date;
    to: Date;
    /** A booking being rescheduled: its current slot must not count against its own move. */
    excludeBookingId?: string;
  },
): Promise<CandidatePool> {
  // One round of three parallel queries (not trainers first, then their schedules): every query
  // filters on the same trainer criteria, which matters when the database is a long hop away.
  const trainerWhere = {
    serviceZoneId: args.serviceZoneId,
    isActive: true,
    user: { status: "ACTIVE" as const },
    workoutCategories: { has: args.category },
  };
  const [trainers, windows, bookings] = await Promise.all([
    db.trainerProfile.findMany({
      where: trainerWhere,
      orderBy: { userId: "asc" },
      select: {
        userId: true,
        bio: true,
        specializations: true,
        experienceYears: true,
        workoutCategories: true,
        isActive: true,
        user: { select: { name: true } },
      },
    }),
    db.trainerAvailability.findMany({
      where: { trainer: trainerWhere, startAt: { lt: args.to }, endAt: { gt: args.from } },
      select: { trainerId: true, startAt: true, endAt: true, status: true },
    }),
    db.booking.findMany({
      where: {
        trainer: { is: trainerWhere },
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        startAt: { lt: args.to },
        endAt: { gt: args.from },
        ...(args.excludeBookingId ? { id: { not: args.excludeBookingId } } : {}),
      },
      select: { trainerId: true, startAt: true, endAt: true, status: true },
    }),
  ]);

  const profiles = new Map<string, TrainerProfileView>();
  const candidates = trainers.map((t) => {
    profiles.set(t.userId, {
      trainerId: t.userId,
      name: t.user.name,
      bio: t.bio,
      specializations: t.specializations,
      experienceYears: t.experienceYears,
      categories: t.workoutCategories,
    });
    return {
      trainerId: t.userId,
      name: t.user.name,
      isActive: t.isActive,
      categories: t.workoutCategories,
      schedule: {
        windows: windows.filter((w) => w.trainerId === t.userId),
        bookings: bookings.filter((b) => b.trainerId === t.userId),
      },
    };
  });
  return { candidates, profiles };
}

export async function loadCustomerBookings(
  db: DbOrTx,
  customerId: string,
  from: Date,
  to: Date,
  excludeBookingId?: string,
): Promise<BookingIntervalLike[]> {
  return db.booking.findMany({
    where: {
      customerId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      startAt: { lt: to },
      endAt: { gt: from },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { startAt: true, endAt: true, status: true },
  });
}

/** Local-day bounds wide enough to hold a session starting at `startAt` and that day's bookings. */
export function dayRange(startAt: Date, timeZone: string): { from: Date; to: Date } {
  const key = localDateKey(startAt, timeZone);
  const from = zonedDayStart(key, timeZone);
  const dayEnd = zonedDayStart(addDaysToKey(key, 1), timeZone);
  const end = sessionEnd(startAt);
  return { from: startAt < from ? startAt : from, to: end > dayEnd ? end : dayEnd };
}

// ─── Customer slot grid ─────────────────────────────────────────────────────

export type SlotStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "PAST"
  | "INSTANT_WINDOW"
  | "TOO_FAR"
  | "YOU_ARE_BOOKED"
  /** Rescheduling a paid booking: a trainer is free, but the slot costs a different amount. */
  | "PRICE_DIFFERS";

export type SlotView = {
  startAt: string;
  status: SlotStatus;
  trainerCount: number;
  isPeak: boolean;
  totalAmount: string;
};

export type DaySchedule = { dateKey: string; availableCount: number; slots: SlotView[] };

/** A booking being moved: its own slot doesn't block it, and a paid booking needs the same total. */
export type RescheduleScope = { excludeBookingId: string; requireTotal?: string };

export type ScheduleView = {
  timeZone: string;
  todayKey: string;
  generatedAt: string;
  days: DaySchedule[];
};

function buildDays(
  dateKeys: string[],
  ctx: {
    customer: CustomerContext;
    category: WorkoutCategory;
    candidates: TrainerCandidate[];
    customerBookings: BookingIntervalLike[];
    pricing: ActivePricing;
    now: Date;
    /** Only slots with exactly this total are bookable (rescheduling a pay-per-session booking). */
    requireTotal?: string;
  },
): DaySchedule[] {
  const tz = ctx.customer.timeZone;
  return dateKeys.map((dateKey) => {
    const slots = serviceDayStarts(dateKey, tz).map((startAt): SlotView => {
      const quote = quoteSession(ctx.pricing, startAt, tz);
      const base = {
        startAt: startAt.toISOString(),
        isPeak: quote.isPeak,
        totalAmount: quote.totalAmount,
        trainerCount: 0,
      };
      const timing = scheduledTiming(startAt, ctx.now);
      if (timing !== "OK") return { ...base, status: timing };
      if (hasActiveOverlap(ctx.customerBookings, startAt, sessionEnd(startAt))) {
        return { ...base, status: "YOU_ARE_BOOKED" };
      }
      const criteria = { category: ctx.category, startAt, timeZone: tz };
      const trainerCount = ctx.candidates.filter((c) => ineligibility(c, criteria) === null).length;
      if (trainerCount === 0) return { ...base, status: "UNAVAILABLE" };
      if (ctx.requireTotal && quote.totalAmount !== ctx.requireTotal) {
        return { ...base, trainerCount, status: "PRICE_DIFFERS" };
      }
      return { ...base, trainerCount, status: "AVAILABLE" };
    });
    return { dateKey, availableCount: slots.filter((s) => s.status === "AVAILABLE").length, slots };
  });
}

/** Bookable 60-minute slots for the next BOOKING_HORIZON_DAYS local days, as of `now`. */
export async function getSchedule(
  deps: BookingDeps,
  customer: CustomerContext,
  category: WorkoutCategory,
  dayCount: number = BOOKING_HORIZON_DAYS,
  /** For rescheduling: ignore this booking's own slot, and optionally require a matching total. */
  reschedule?: RescheduleScope,
): Promise<ScheduleView> {
  const now = deps.now();
  const tz = customer.timeZone;
  const todayKey = localDateKey(now, tz);
  const dateKeys = Array.from({ length: dayCount }, (_, i) => addDaysToKey(todayKey, i));
  const from = zonedDayStart(todayKey, tz);
  const to = zonedDayStart(addDaysToKey(todayKey, dayCount), tz);
  const excludeBookingId = reschedule?.excludeBookingId;
  const [pool, customerBookings, pricing] = await Promise.all([
    loadCandidatePool(deps.db, { serviceZoneId: customer.serviceZoneId, category, from, to, excludeBookingId }),
    loadCustomerBookings(deps.db, customer.userId, from, to, excludeBookingId),
    loadActivePricing(deps.db, now),
  ]);
  return {
    timeZone: tz,
    todayKey,
    generatedAt: now.toISOString(),
    days: buildDays(dateKeys, {
      customer,
      category,
      candidates: pool.candidates,
      customerBookings,
      pricing,
      now,
      requireTotal: reschedule?.requireTotal,
    }),
  };
}

/**
 * Up to `limit` bookable scheduled slots nearest to `around` (same day and the next two), offered
 * when the requested slot can't be booked. Returned in chronological order.
 */
export async function findAlternatives(
  deps: BookingDeps,
  customer: CustomerContext,
  category: WorkoutCategory,
  around: Date,
  limit = 3,
  reschedule?: RescheduleScope,
): Promise<SlotSuggestion[]> {
  const now = deps.now();
  const tz = customer.timeZone;
  const firstKey = localDateKey(around > now ? around : now, tz);
  const dateKeys = [0, 1, 2].map((i) => addDaysToKey(firstKey, i));
  const from = zonedDayStart(dateKeys[0]!, tz);
  const to = zonedDayStart(addDaysToKey(firstKey, 3), tz);
  const excludeBookingId = reschedule?.excludeBookingId;
  const [pool, customerBookings, pricing] = await Promise.all([
    loadCandidatePool(deps.db, { serviceZoneId: customer.serviceZoneId, category, from, to, excludeBookingId }),
    loadCustomerBookings(deps.db, customer.userId, from, to, excludeBookingId),
    loadActivePricing(deps.db, now),
  ]);
  const target = around.getTime();
  return buildDays(dateKeys, {
    customer,
    category,
    candidates: pool.candidates,
    customerBookings,
    pricing,
    now,
    requireTotal: reschedule?.requireTotal,
  })
    .flatMap((d) => d.slots)
    .filter((s) => s.status === "AVAILABLE" && s.startAt !== around.toISOString())
    .sort((a, b) => Math.abs(Date.parse(a.startAt) - target) - Math.abs(Date.parse(b.startAt) - target))
    .slice(0, limit)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    .map(({ startAt, trainerCount, isPeak, totalAmount }) => ({
      startAt,
      trainerCount,
      isPeak,
      totalAmount,
    }));
}
