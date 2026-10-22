import "dotenv/config";
import type { CoachContext } from "@/lib/coach/context";
import { runCoach } from "@/lib/coach/graph";
import { coachModelsFromEnv } from "@/server/coach/models";

/**
 * Live check of the fitness coach graph against the configured providers, outside the app and the
 * database: a synthetic customer asks one question of each kind, and the script prints how each
 * was routed, which model answered, latency and tokens. Nothing is stored.
 *
 *   npm run coach:smoke
 */
const SYNTHETIC: CoachContext = {
  firstName: "Demo",
  now: "Thu, 22 Oct · 7:40 PM IST",
  level: "Beginner",
  goals: ["Strength", "Consistency"],
  intensity: "Moderate",
  environment: "Home",
  equipment: ["Yoga mat", "Dumbbells"],
  preferences: ["Morning workouts"],
  limitations: "Tight shoulders",
  avoid: "Burpees",
  nextSession: { when: "Fri, 23 Oct · 10:00 AM", category: "Strength training", trainerFirstName: "Arjun", status: "CONFIRMED" },
  upcomingCount: 1,
  pkg: { name: "Fitness Pack", remaining: 6, total: 10, validUntil: "Tue, 5 Jan" },
  completedCount: 3,
  recentSessions: [{ date: "Mon, 19 Oct", category: "Cardio", trainerSuggestion: "Lower-body strength with a short finisher." }],
  latestPlan: null,
};

const QUESTIONS = [
  "How should I warm up before tomorrow's session, given my shoulders?",
  "How many sessions do I have left in my package?",
  "Can I take ibuprofen before training for my knee pain?",
  "Write me a Python function that sorts a list.",
  "I felt chest pain during my workout today, what should I do?",
];

async function main() {
  const env = process.env;
  const models = coachModelsFromEnv({
    GROQ_API_KEY: env.GROQ_API_KEY,
    GROQ_MODEL: env.GROQ_MODEL,
    GROQ_FAST_MODEL: env.GROQ_FAST_MODEL,
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: env.OPENROUTER_MODEL,
  });
  console.log(`Classifiers: ${models.classifiers.map((m) => m.id).join(" > ") || "none (heuristic)"}`);
  console.log(`Answerers:   ${models.answerers.map((m) => m.id).join(" > ") || "none (rule-based)"}`);
  for (const question of QUESTIONS) {
    const started = Date.now();
    const r = await runCoach({ models, loadContext: async () => SYNTHETIC }, { question, history: [] });
    console.log(`\nQ: ${question}`);
    console.log(
      `   ${r.route} · ${r.source} · topic ${r.topic ?? "—"} (${r.classifiedBy ?? "guard"}) · ${r.modelId ?? "no model"} · ${Date.now() - started} ms · tokens ${r.usage.inputTokens} in / ${r.usage.outputTokens} out${r.errors.length ? ` · failures ${r.errors.join(", ")}` : ""}`,
    );
    console.log(`   A: ${(r.reply ?? "").replace(/\n/g, " / ").slice(0, 260)}`);
    if (r.route === "ANSWERED" && r.source !== "AI") process.exitCode = 1;
  }
}

void main();
