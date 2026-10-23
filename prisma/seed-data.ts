/**
 * Synthetic demo dataset. Every person, email and address here is fictional; emails use the
 * reserved `.example` TLD so nothing can ever be delivered to a real inbox.
 *
 * `buildSeedPlan` is pure: the same anchor date always yields the same records (same ids, same
 * values), which is what makes the seed deterministic and testable. Times are anchored to the
 * current day in IST so the demo always has "upcoming" and "past" sessions.
 */
import { calculatePriceBreakdown, isPeakStart, type PeakWindowLike } from "../src/lib/pricing";
import { istMidnight } from "../src/lib/utils/time";

export { istMidnight };

export const TZ = "Asia/Kolkata";

type Goal = "WEIGHT_LOSS" | "STRENGTH" | "MOBILITY" | "ENDURANCE" | "POSTURE" | "GENERAL_FITNESS";
type Level = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
type Pref =
  "MORNING" | "EVENING" | "LOW_IMPACT" | "HIGH_INTENSITY" | "YOGA" | "BODYWEIGHT" | "WEIGHTS" | "OUTDOOR";
type AvailabilityStatus = "AVAILABLE" | "BLOCKED";
type Category = "STRENGTH" | "YOGA" | "CARDIO" | "FUNCTIONAL" | "MOBILITY";
type Status = "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED";

export const ZONES = [
  {
    id: "seed_zone_palm_grove",
    slug: "palm-grove",
    name: "Palm Grove Residences",
    city: "Bengaluru",
    latitude: "12.969800",
    longitude: "77.750000",
  },
  {
    id: "seed_zone_lakeview",
    slug: "lakeview-heights",
    name: "Lakeview Heights",
    city: "Bengaluru",
    latitude: "12.911600",
    longitude: "77.647400",
  },
  {
    id: "seed_zone_cedar_court",
    slug: "cedar-court",
    name: "Cedar Court",
    city: "Bengaluru",
    latitude: "13.035800",
    longitude: "77.597000",
  },
] as const;

export const CUSTOMERS: Array<{
  id: string;
  name: string;
  email: string;
  zoneId: string;
  addressLine: string;
  age: number | null;
  weightKg: string | null;
  goals: Goal[];
  level: Level | null;
  prefs: Pref[];
  assessed: boolean;
}> = [
  {
    id: "seed_user_priya",
    name: "Priya Sharma",
    email: "priya.sharma@demo.zuryofit.example",
    zoneId: "seed_zone_palm_grove",
    addressLine: "Tower B, 1204",
    age: 32,
    weightKg: "64.5",
    goals: ["WEIGHT_LOSS", "STRENGTH"],
    level: "INTERMEDIATE",
    prefs: ["MORNING", "WEIGHTS"],
    assessed: true,
  },
  {
    id: "seed_user_rahul",
    name: "Rahul Verma",
    email: "rahul.verma@demo.zuryofit.example",
    zoneId: "seed_zone_palm_grove",
    addressLine: "Tower D, 803",
    age: 41,
    weightKg: "82.0",
    goals: ["GENERAL_FITNESS", "MOBILITY"],
    level: "BEGINNER",
    prefs: ["EVENING", "LOW_IMPACT"],
    assessed: true,
  },
  {
    id: "seed_user_farhan",
    name: "Farhan Qureshi",
    email: "farhan.qureshi@demo.zuryofit.example",
    zoneId: "seed_zone_cedar_court",
    addressLine: "Block 2, 401",
    age: 28,
    weightKg: "71.0",
    goals: ["ENDURANCE"],
    level: "ADVANCED",
    prefs: ["MORNING", "OUTDOOR", "HIGH_INTENSITY"],
    assessed: true,
  },
  {
    id: "seed_user_ananya",
    name: "Ananya Iyer",
    email: "ananya.iyer@demo.zuryofit.example",
    zoneId: "seed_zone_lakeview",
    addressLine: "Wing C, 1102",
    age: null,
    weightKg: null,
    goals: [],
    level: null,
    prefs: [],
    assessed: false,
  },
];

/**
 * Trainers. `base` is simulated GPS: the point each trainer sets out from, a few kilometres from the
 * community they serve (Palm Grove: Arjun ~2 km, Kavya ~4.6 km, Sana ~6 km), so distance visibly
 * changes matching and instant-booking reach. Synthetic coordinates, not real addresses.
 */
export const TRAINERS = [
  {
    id: "seed_user_arjun",
    name: "Arjun Mehta",
    email: "arjun.mehta@demo.zuryofit.example",
    zoneId: "seed_zone_palm_grove",
    specializations: ["Strength", "Mobility"],
    categories: ["STRENGTH", "MOBILITY"],
    experienceYears: 6,
    bio: "Strength and mobility coach. Builds steady, sustainable progress.",
    base: { latitude: "12.985000", longitude: "77.759000" },
  },
  {
    id: "seed_user_kavya",
    name: "Kavya Rao",
    email: "kavya.rao@demo.zuryofit.example",
    zoneId: "seed_zone_palm_grove",
    specializations: ["HIIT", "Weight loss"],
    categories: ["CARDIO", "FUNCTIONAL"],
    experienceYears: 4,
    bio: "High-energy interval sessions, adapted to every level.",
    base: { latitude: "12.940000", longitude: "77.780000" },
  },
  {
    id: "seed_user_rohan",
    name: "Rohan Das",
    email: "rohan.das@demo.zuryofit.example",
    zoneId: "seed_zone_lakeview",
    specializations: ["Yoga", "Posture"],
    categories: ["YOGA", "MOBILITY"],
    experienceYears: 8,
    bio: "Yoga and posture work for desk-bound bodies.",
    base: { latitude: "12.923000", longitude: "77.638000" },
  },
  {
    id: "seed_user_meera",
    name: "Meera Pillai",
    email: "meera.pillai@demo.zuryofit.example",
    zoneId: "seed_zone_cedar_court",
    specializations: ["Endurance", "Functional training"],
    categories: ["CARDIO", "FUNCTIONAL"],
    experienceYears: 5,
    bio: "Endurance and functional training for runners and cyclists.",
    base: { latitude: "13.018000", longitude: "77.585000" },
  },
  // Phase 2: a second Palm Grove trainer so every workout category has a local coach.
  {
    id: "seed_user_sana",
    name: "Sana Kulkarni",
    email: "sana.kulkarni@demo.zuryofit.example",
    zoneId: "seed_zone_palm_grove",
    specializations: ["Yoga", "Mobility"],
    categories: ["YOGA", "MOBILITY"],
    experienceYears: 7,
    bio: "Breath-led yoga and mobility work for stiff backs and busy schedules.",
    base: { latitude: "12.990000", longitude: "77.698000" },
  },
] as const;

/**
 * Days of trainer availability the seed opens, starting today. Matches the 30-day booking horizon,
 * so a deployment seeded once stays bookable for a month (re-running the seed rolls it forward).
 */
export const AVAILABILITY_DAYS = 30;
/**
 * Trainers who also work 12:00–16:00, so an instant booking for their categories can be demoed in
 * the afternoon. Everyone else keeps a split shift, which leaves gaps that show no-trainer handling.
 */
export const FULL_DAY_TRAINERS = ["seed_user_arjun"] as const;

export const OPERATIONS_USER = {
  id: "seed_user_neha",
  name: "Neha Kapoor",
  email: "neha.kapoor@demo.zuryofit.example",
} as const;

export const PEAK_WINDOWS: Array<PeakWindowLike & { id: string; label: string }> = [
  {
    id: "seed_peak_weekday_morning",
    label: "Weekday mornings",
    daysOfWeek: [1, 2, 3, 4, 5],
    startMinute: 6 * 60,
    endMinute: 9 * 60,
  },
  {
    id: "seed_peak_weekday_evening",
    label: "Weekday evenings",
    daysOfWeek: [1, 2, 3, 4, 5],
    startMinute: 17 * 60,
    endMinute: 20 * 60,
  },
  {
    id: "seed_peak_weekend_morning",
    label: "Weekend mornings",
    daysOfWeek: [6, 7],
    startMinute: 7 * 60,
    endMinute: 11 * 60,
  },
];

export const PRICING_RULES = [
  {
    id: "seed_pricing_normal",
    name: "Standard session",
    kind: "NORMAL",
    sessionPrice: "399.00",
    commissionPercent: "10.00",
  },
  {
    id: "seed_pricing_peak",
    name: "Peak session",
    kind: "PEAK",
    sessionPrice: "499.00",
    commissionPercent: "10.00",
  },
] as const;

/**
 * The package catalogue (demo configuration, editable in the database). Prices are before the
 * society commission, which is added at checkout from the active standard rule.
 */
export const PACKAGE_PLANS = [
  {
    id: "seed_plan_single",
    slug: "single-session",
    name: "Single Session",
    description: "One session to use whenever suits you.",
    sessionCount: 1,
    price: "399.00",
    validityDays: 30,
    sortOrder: 1,
  },
  {
    id: "seed_plan_starter",
    slug: "starter-pack",
    name: "Starter Pack",
    description: "Five sessions to build a routine.",
    sessionCount: 5,
    price: "1895.00",
    validityDays: 60,
    sortOrder: 2,
  },
  {
    id: "seed_plan_fitness",
    slug: "fitness-pack",
    name: "Fitness Pack",
    description: "Ten sessions for a steady two-to-three-a-week habit.",
    sessionCount: 10,
    price: "3590.00",
    validityDays: 90,
    sortOrder: 3,
  },
] as const;

/** Phase 4: voluntary preference detail per customer, shown in the fitness profile. */
export const PROFILE_DETAILS: Record<
  string,
  {
    intensity: "LOW" | "MODERATE" | "HIGH" | null;
    equipment: Array<"NONE" | "MAT" | "DUMBBELLS" | "RESISTANCE_BAND">;
    environment: "HOME" | "OUTDOOR" | null;
    avoidExercises: string | null;
    accommodations: string | null;
    movementLimitations: string | null;
    goalDetails: string | null;
  }
> = {
  seed_user_priya: {
    intensity: "MODERATE",
    equipment: ["MAT", "DUMBBELLS"],
    environment: "HOME",
    avoidExercises: "Barbell overhead presses",
    accommodations: null,
    movementLimitations: "Tight shoulders after long desk days",
    goalDetails: "Train three times a week and keep the workouts under an hour.",
  },
  seed_user_farhan: {
    intensity: "HIGH",
    equipment: ["NONE"],
    environment: "OUTDOOR",
    avoidExercises: null,
    accommodations: null,
    movementLimitations: null,
    goalDetails: null,
  },
};

/** Phase 4: per-goal tracking rows (targets, status) for the seeded customers. */
export const FITNESS_GOAL_TRACKING = [
  {
    id: "seed_goal_priya_strength",
    customerId: "seed_user_priya",
    goal: "STRENGTH",
    status: "ACTIVE",
    target: "Three sessions a week",
    targetDate: null,
  },
  {
    id: "seed_goal_priya_weight",
    customerId: "seed_user_priya",
    goal: "WEIGHT_LOSS",
    status: "ACTIVE",
    target: "Stick with the plan for 8 weeks",
    targetDate: null,
  },
  {
    id: "seed_goal_farhan_endurance",
    customerId: "seed_user_farhan",
    goal: "ENDURANCE",
    status: "ACTIVE",
    target: null,
    targetDate: null,
  },
] as const;

type BookingSeed = {
  id: string;
  reference: string;
  customerId: string;
  trainerId: string | null;
  zoneId: string;
  mode: "INSTANT" | "SCHEDULED";
  status: Status;
  category: Category;
  customerNotes?: string;
  day: number;
  hour: number;
  minute?: number;
  packageId?: string;
  payment?: "SUCCEEDED" | "FAILED";
  cancelled?: boolean;
  refunded?: boolean;
  session?: { activities: unknown[]; notes: string; next: string; feedback?: string };
};

const BOOKINGS: BookingSeed[] = [
  // Priya — 10-session package: three completed, one cancelled and refunded, one upcoming.
  {
    id: "seed_bk_01",
    reference: "ZY-PS001",
    customerId: "seed_user_priya",
    trainerId: "seed_user_arjun",
    zoneId: "seed_zone_palm_grove",
    mode: "SCHEDULED",
    status: "COMPLETED",
    category: "STRENGTH",
    day: -9,
    hour: 7,
    packageId: "seed_pkg_priya",
    session: {
      activities: [
        { name: "Goblet squat", sets: 3, reps: 12 },
        { name: "Dumbbell row", sets: 3, reps: 10 },
        { name: "Plank", sets: 3, durationSec: 40 },
      ],
      notes: "Good squat depth. Keep elbows tucked on rows.",
      next: "Lower-body strength with a short conditioning finisher.",
      feedback: "Loved the pace. Shoulders felt tight on rows.",
    },
  },
  {
    id: "seed_bk_02",
    reference: "ZY-PS002",
    customerId: "seed_user_priya",
    trainerId: "seed_user_arjun",
    zoneId: "seed_zone_palm_grove",
    mode: "SCHEDULED",
    status: "COMPLETED",
    category: "STRENGTH",
    day: -6,
    hour: 10,
    packageId: "seed_pkg_priya",
    session: {
      activities: [
        { name: "Romanian deadlift", sets: 3, reps: 10 },
        { name: "Walking lunge", sets: 3, reps: 12 },
        { name: "Bike intervals", durationMin: 8 },
      ],
      notes: "Hinge pattern improving. Added light load on RDLs.",
      next: "Upper-body push and pull, add band pull-aparts for shoulders.",
    },
  },
  {
    id: "seed_bk_03",
    reference: "ZY-PS003",
    customerId: "seed_user_priya",
    trainerId: "seed_user_kavya",
    zoneId: "seed_zone_palm_grove",
    mode: "INSTANT",
    status: "COMPLETED",
    category: "CARDIO",
    day: -2,
    hour: 18,
    packageId: "seed_pkg_priya",
    session: {
      activities: [
        { name: "Kettlebell swing", sets: 4, reps: 15 },
        { name: "Push-up", sets: 3, reps: 10 },
        { name: "Mountain climber", sets: 3, durationSec: 30 },
      ],
      notes: "Strong effort on swings. Watch hip drop in push-ups.",
      next: "Mobility-focused recovery session before the next strength day.",
      feedback: "Tough but fun.",
    },
  },
  {
    id: "seed_bk_04",
    reference: "ZY-PS004",
    customerId: "seed_user_priya",
    trainerId: "seed_user_arjun",
    zoneId: "seed_zone_palm_grove",
    mode: "SCHEDULED",
    status: "CANCELLED",
    category: "STRENGTH",
    day: -4,
    hour: 7,
    packageId: "seed_pkg_priya",
    cancelled: true,
    refunded: true,
  },
  {
    id: "seed_bk_05",
    reference: "ZY-PS005",
    customerId: "seed_user_priya",
    trainerId: "seed_user_arjun",
    zoneId: "seed_zone_palm_grove",
    mode: "SCHEDULED",
    status: "CONFIRMED",
    category: "STRENGTH",
    customerNotes: "Shoulders were tight after the last session, so lighter rows please.",
    day: 2,
    hour: 10,
    packageId: "seed_pkg_priya",
  },
  // Rahul — pays per session (simulated payments).
  {
    id: "seed_bk_06",
    reference: "ZY-RV001",
    customerId: "seed_user_rahul",
    trainerId: "seed_user_kavya",
    zoneId: "seed_zone_palm_grove",
    mode: "SCHEDULED",
    status: "COMPLETED",
    category: "FUNCTIONAL",
    day: -3,
    hour: 18,
    payment: "SUCCEEDED",
    session: {
      activities: [
        { name: "Cat-cow", sets: 2, reps: 10 },
        { name: "Glute bridge", sets: 3, reps: 12 },
        { name: "Brisk walk", durationMin: 15 },
      ],
      notes: "Lower back felt stiff early, eased after warm-up. Keep it low impact.",
      next: "Gentle mobility flow and bodyweight basics.",
    },
  },
  {
    id: "seed_bk_07",
    reference: "ZY-RV002",
    customerId: "seed_user_rahul",
    trainerId: "seed_user_arjun",
    zoneId: "seed_zone_palm_grove",
    mode: "SCHEDULED",
    status: "CONFIRMED",
    category: "MOBILITY",
    customerNotes: "Lower back gets stiff in the evenings. Low impact, please.",
    day: 0,
    hour: 16,
    payment: "SUCCEEDED",
  },
  {
    id: "seed_bk_08",
    reference: "ZY-RV003",
    customerId: "seed_user_rahul",
    trainerId: null,
    zoneId: "seed_zone_palm_grove",
    mode: "SCHEDULED",
    status: "FAILED",
    category: "MOBILITY",
    day: 1,
    hour: 19,
    payment: "FAILED",
  },
  // Farhan — a scheduled booking still waiting for a trainer (shows up as "unassigned" for ops).
  {
    id: "seed_bk_09",
    reference: "ZY-FQ001",
    customerId: "seed_user_farhan",
    trainerId: null,
    zoneId: "seed_zone_cedar_court",
    mode: "SCHEDULED",
    status: "PENDING",
    category: "CARDIO",
    day: 1,
    hour: 6,
    payment: "SUCCEEDED",
  },
  {
    id: "seed_bk_10",
    reference: "ZY-FQ002",
    customerId: "seed_user_farhan",
    trainerId: "seed_user_meera",
    zoneId: "seed_zone_cedar_court",
    mode: "SCHEDULED",
    status: "CONFIRMED",
    category: "CARDIO",
    day: 3,
    hour: 7,
    payment: "SUCCEEDED",
  },
];

export function buildSeedPlan(anchor: Date) {
  const midnight = istMidnight(anchor);
  const at = (day: number, hour: number, minute = 0) =>
    new Date(midnight.getTime() + ((day * 24 + hour) * 60 + minute) * 60_000);

  const bookings = BOOKINGS.map((b) => {
    const startAt = at(b.day, b.hour, b.minute);
    const endAt = new Date(startAt.getTime() + 60 * 60_000);
    const peak = isPeakStart(startAt, PEAK_WINDOWS, TZ);
    const rule = PRICING_RULES[peak ? 1 : 0];
    const price = calculatePriceBreakdown(rule);
    return {
      ...b,
      startAt,
      endAt,
      isPeak: peak,
      pricingRuleId: rule.id,
      ...price,
      cancelledAt: b.cancelled ? at(b.day - 1, 20) : null,
    };
  });

  const availability = TRAINERS.flatMap((t) =>
    Array.from({ length: AVAILABILITY_DAYS }, (_, d) => [
      {
        id: `seed_av_${t.id.slice(10)}_d${d}_am`,
        trainerId: t.id,
        startAt: at(d, 6),
        endAt: at(d, 12),
        status: "AVAILABLE" as AvailabilityStatus,
        note: null as string | null,
      },
      ...((FULL_DAY_TRAINERS as readonly string[]).includes(t.id)
        ? [
            {
              id: `seed_av_${t.id.slice(10)}_d${d}_mid`,
              trainerId: t.id,
              startAt: at(d, 12),
              endAt: at(d, 16),
              status: "AVAILABLE" as AvailabilityStatus,
              note: null as string | null,
            },
          ]
        : []),
      {
        id: `seed_av_${t.id.slice(10)}_d${d}_pm`,
        trainerId: t.id,
        startAt: at(d, 16),
        endAt: at(d, 21),
        status: "AVAILABLE" as AvailabilityStatus,
        note: null as string | null,
      },
    ]).flat(),
  ).concat([
    {
      id: "seed_av_kavya_d3_block",
      trainerId: "seed_user_kavya",
      startAt: at(3, 6),
      endAt: at(3, 21),
      status: "BLOCKED" as AvailabilityStatus,
      note: "Personal day" as string | null,
    },
  ]);

  const ledger = bookings
    .filter((b) => b.packageId)
    .flatMap((b) => [
      {
        id: `seed_ledger_${b.id}_debit`,
        packageId: b.packageId!,
        bookingId: b.id,
        delta: -1,
        reason: "BOOKING_DEBIT" as const,
        createdAt: at(b.day - 1, 9),
      },
      ...(b.refunded
        ? [
            {
              id: `seed_ledger_${b.id}_refund`,
              packageId: b.packageId!,
              bookingId: b.id,
              delta: 1,
              reason: "CANCELLATION_REFUND" as const,
              createdAt: at(b.day - 1, 20),
            },
          ]
        : []),
    ]);

  const standardCommission = PRICING_RULES[0].commissionPercent;
  const packages = [
    { id: "seed_pkg_priya", customerId: "seed_user_priya", plan: PACKAGE_PLANS[2], purchasedAt: at(-14, 9) },
    { id: "seed_pkg_farhan", customerId: "seed_user_farhan", plan: PACKAGE_PLANS[1], purchasedAt: at(-5, 9) },
  ].map(({ plan, ...p }) => {
    const price = calculatePriceBreakdown({
      sessionPrice: plan.price,
      commissionPercent: standardCommission,
    });
    return {
      ...p,
      planId: plan.id,
      name: plan.name,
      totalSessions: plan.sessionCount,
      basePrice: price.sessionPrice,
      commissionPercent: price.commissionPercent,
      commissionAmount: price.commissionAmount,
      pricePaid: price.totalAmount,
      validityDays: plan.validityDays,
      expiresAt: new Date(p.purchasedAt.getTime() + plan.validityDays * 86_400_000),
      usedSessions: -ledger.filter((e) => e.packageId === p.id).reduce((sum, e) => sum + e.delta, 0),
    };
  });

  const payments = [
    ...bookings
      .filter((b) => b.payment)
      .map((b) => ({
        id: `seed_pay_${b.id}`,
        bookingId: b.id as string | null,
        packageId: null as string | null,
        amount: b.totalAmount,
        baseAmount: b.sessionPrice,
        commissionAmount: b.commissionAmount,
        status: b.payment!,
        providerReference: b.payment === "SUCCEEDED" ? `SIM-${b.reference}` : null,
        idempotencyKey: `seed-${b.id}`,
        failureReason: b.payment === "FAILED" ? "Simulated decline (demo)" : null,
        completedAt: at(b.day - 1, 12),
      })),
    // Seeded packages were bought with a (simulated) payment too, so financial reports add up.
    ...packages.map((p) => ({
      id: `seed_pay_${p.id}`,
      bookingId: null as string | null,
      packageId: p.id as string | null,
      amount: p.pricePaid,
      baseAmount: p.basePrice,
      commissionAmount: p.commissionAmount,
      status: "SUCCEEDED" as const,
      providerReference: `SIM-${p.id.toUpperCase()}`,
      idempotencyKey: `seed-${p.id}`,
      failureReason: null,
      completedAt: p.purchasedAt,
    })),
  ];

  const sessions = bookings
    .filter((b) => b.session)
    .map((b) => ({
      id: `seed_session_${b.id}`,
      bookingId: b.id,
      startedAt: new Date(b.startAt.getTime() + 2 * 60_000),
      endsAt: new Date(b.startAt.getTime() + 62 * 60_000),
      plannedMinutes: 60,
      warningSentAt: new Date(b.startAt.getTime() + 57 * 60_000),
      completedAt: new Date(b.startAt.getTime() + 62 * 60_000),
      completionSource: "TRAINER" as const,
      activities: b.session!.activities,
      trainerNotes: b.session!.notes,
      suggestedNextWorkout: b.session!.next,
      customerFeedback: b.session!.feedback ?? null,
    }));

  const notifications = [
    {
      id: "seed_ntf_01",
      recipientId: "seed_user_priya",
      bookingId: "seed_bk_05",
      type: "BOOKING_ASSIGNED" as const,
      title: "Arjun Mehta is your trainer",
      message: "Your session is confirmed at Palm Grove Residences.",
      createdAt: at(-1, 11),
      readAt: null,
    },
    {
      id: "seed_ntf_02",
      recipientId: "seed_user_priya",
      bookingId: "seed_bk_03",
      type: "SESSION_COMPLETED" as const,
      title: "Session completed",
      message: "Kavya added notes and a suggested next workout.",
      createdAt: at(-2, 19, 5),
      readAt: at(-2, 20),
    },
    {
      id: "seed_ntf_03",
      recipientId: "seed_user_priya",
      bookingId: "seed_bk_04",
      type: "BOOKING_CANCELLED" as const,
      title: "Booking ZY-PS004 cancelled",
      message: "1 session was returned to your package.",
      createdAt: at(-5, 20),
      readAt: at(-5, 21),
    },
    {
      id: "seed_ntf_04",
      recipientId: "seed_user_arjun",
      bookingId: "seed_bk_07",
      type: "BOOKING_ASSIGNED" as const,
      title: "New session today with Rahul Verma",
      message: "Palm Grove Residences, Tower D.",
      createdAt: at(-1, 15),
      readAt: null,
    },
    {
      id: "seed_ntf_05",
      recipientId: "seed_user_arjun",
      bookingId: "seed_bk_05",
      type: "BOOKING_ASSIGNED" as const,
      title: "New session with Priya Sharma",
      message: "Palm Grove Residences, Tower B.",
      createdAt: at(-1, 11),
      readAt: null,
    },
  ];

  return {
    zones: ZONES,
    packagePlans: PACKAGE_PLANS,
    customers: CUSTOMERS,
    trainers: TRAINERS,
    operations: OPERATIONS_USER,
    pricingRules: PRICING_RULES,
    peakWindows: PEAK_WINDOWS,
    bookings,
    availability,
    packages,
    ledger,
    payments,
    sessions,
    notifications,
    profileDetails: PROFILE_DETAILS,
    fitnessGoalTracking: FITNESS_GOAL_TRACKING,
  };
}

export type SeedPlan = ReturnType<typeof buildSeedPlan>;
