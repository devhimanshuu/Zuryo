import type { CoachRouteValue } from "./scope";

export type FollowUpLink = { href: string; label: string };
export type FollowUps = { prompts: string[]; links: FollowUpLink[] };

type Topic = "WARMUP" | "RECOVERY" | "NUTRITION" | "HABITS" | "WORKOUT" | "MY_ZURYOFIT";

const TOPIC_TESTS: Array<[Topic, RegExp]> = [
  [
    "MY_ZURYOFIT",
    /\b(book(ing|ed)?|sessions? (left|remaining)|next session|package|credits?|trainer|zuryofit)\b/i,
  ],
  ["NUTRITION", /\b(eat|food|protein|carbs?|calories?|meals?|hydrat\w*|water|nutrition|breakfast|snack)\b/i],
  ["RECOVERY", /\b(recover\w*|sore(ness)?|rest days?|sleep|stretch\w*|foam roll\w*|cool[- ]?down)\b/i],
  ["WARMUP", /\b(warm[- ]?up|mobility|dynamic|activation|prepare)\b/i],
  ["HABITS", /\b(habit|consisten\w*|motivat\w*|routine|streak|schedule|discipline)\b/i],
  ["WORKOUT", /\b(workout|exercise|squat|lunge|push[- ]?up|plank|reps?|sets?|strength|cardio|yoga)\b/i],
];

const PROMPTS: Record<Topic, string[]> = {
  WARMUP: [
    "Can you give me a quick 5-minute version?",
    "What should I do right after the workout?",
    "Which of these are best for my limitations?",
  ],
  RECOVERY: [
    "How much sleep and rest do I need?",
    "Should I still train tomorrow?",
    "Which stretches help most?",
  ],
  NUTRITION: [
    "What should I eat after training?",
    "Can you suggest a simple vegetarian option?",
    "How much water should I drink?",
  ],
  HABITS: ["How do I plan my week around this?", "What if I miss a session?", "How do I track my progress?"],
  WORKOUT: [
    "How should I warm up for this?",
    "Can you suggest a beginner-friendly version?",
    "How many sets and reps should I do?",
  ],
  MY_ZURYOFIT: [
    "What should I prepare before my next session?",
    "How can I get the most from my trainer?",
    "How do I stay consistent with my package?",
  ],
};

const LINK_TESTS: Array<[RegExp, FollowUpLink]> = [
  [
    /\b(book(ing)?|schedule a session|new session)\b/i,
    { href: "/customer/bookings/new", label: "Book a session" },
  ],
  [
    /\b(my bookings|upcoming|next session|reschedul\w*|cancel\w*)\b/i,
    { href: "/customer/bookings", label: "My bookings" },
  ],
  [/\b(package|credits?|sessions? (left|remaining))\b/i, { href: "/customer/packages", label: "Packages" }],
  [/\b(profile|goals?|assessment)\b/i, { href: "/customer/fitness?tab=profile", label: "Fitness profile" }],
];

/**
 * Next-step suggestions for an assistant reply, derived from what the reply is about. Pure and
 * deterministic (no extra model call): up to three follow-up questions and up to two app links.
 * Replies held back by the safety, medical or scope rules get none, so the coach never nudges
 * past a refusal.
 */
export function followUpsFor(content: string, route: CoachRouteValue | null): FollowUps {
  if (route && route !== "ANSWERED") return { prompts: [], links: [] };
  const topic = TOPIC_TESTS.find(([, re]) => re.test(content))?.[0] ?? "WORKOUT";
  const links = LINK_TESTS.filter(([re]) => re.test(content))
    .map(([, link]) => link)
    .slice(0, 2);
  return { prompts: PROMPTS[topic].slice(0, 3), links };
}
