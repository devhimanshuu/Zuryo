import type { BaseMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import type { CoachContext } from "@/lib/coach/context";
import { coachContextToPrompt } from "@/lib/coach/context";
import { runCoach, sanitizeReply, type CoachModel } from "@/lib/coach/graph";
import { COACH_LIMITS, heuristicTopic, parseTopic, safetyGuard } from "@/lib/coach/scope";
import { coachModelsFromEnv } from "@/server/coach/models";

const ctx: CoachContext = {
  firstName: "Priya",
  now: "Thu, 22 Oct · 7:40 PM IST",
  level: "Intermediate",
  goals: ["Strength", "Weight loss"],
  intensity: "Moderate",
  environment: "Home",
  equipment: ["Mat", "Dumbbells"],
  preferences: ["Morning"],
  limitations: "Tight shoulders",
  avoid: null,
  nextSession: {
    when: "Fri, 23 Oct · 10:00 AM",
    category: "Strength training",
    trainerFirstName: "Arjun",
    status: "CONFIRMED",
  },
  upcomingCount: 1,
  pkg: { name: "Fitness Pack", remaining: 6, total: 10, validUntil: "Tue, 5 Jan" },
  completedCount: 3,
  recentSessions: [
    { date: "Mon, 19 Oct", category: "Cardio", trainerSuggestion: "Lower-body strength next" },
  ],
  latestPlan: null,
};

/** A fake chat model: answers from a list, or throws the given error; records what it was sent. */
function fake(id: string, ...answers: Array<string | Error>): CoachModel & { calls: BaseMessage[][] } {
  const calls: BaseMessage[][] = [];
  let i = 0;
  return {
    id,
    calls,
    model: {
      async invoke(messages: BaseMessage[]) {
        calls.push(messages);
        const a = answers[Math.min(i++, answers.length - 1)];
        if (a instanceof Error) throw a;
        return { content: a, usage_metadata: { input_tokens: 100, output_tokens: 20 } };
      },
    },
  };
}
const rateLimited = () => Object.assign(new Error("429 Too Many Requests"), { status: 429 });

function deps(classifiers: CoachModel[], answerers: CoachModel[], loads = { n: 0 }) {
  return {
    models: { classifiers, answerers },
    loadContext: async () => {
      loads.n++;
      return ctx;
    },
  };
}

describe("coach graph routing", () => {
  it("answers an in-scope question with the first model, using the customer's data and history", async () => {
    const classifier = fake("groq:fast", "WORKOUT");
    const answerer = fake("groq:big", "Warm up with 5 minutes of brisk walking.");
    const r = await runCoach(deps([classifier], [answerer]), {
      question: "How should I warm up?",
      history: [
        { role: "USER", content: "Hi" },
        { role: "ASSISTANT", content: "Hello Priya!" },
      ],
    });
    expect(r).toMatchObject({
      route: "ANSWERED",
      source: "AI",
      modelId: "groq:big",
      topic: "WORKOUT",
      errors: [],
    });
    expect(r.reply).toBe("Warm up with 5 minutes of brisk walking.");
    const sent = answerer.calls[0]!;
    expect(sent).toHaveLength(4); // system + 2 history + question
    expect(String(sent[0]!.content)).toContain("Tight shoulders");
    expect(String(sent[0]!.content)).toContain("6 of 10 sessions left");
    expect(r.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
  });

  it("stops at the safety guard before any model or data is touched", async () => {
    const classifier = fake("c", "WORKOUT");
    const loads = { n: 0 };
    const r = await runCoach(deps([classifier], [fake("a", "x")], loads), {
      question: "I have chest pain after squats, should I continue?",
      history: [],
    });
    expect(r).toMatchObject({ route: "SAFETY", source: "RULE_BASED", guard: "EMERGENCY", attempted: [] });
    expect(r.reply).toMatch(/112/);
    expect(classifier.calls).toHaveLength(0);
    expect(loads.n).toBe(0);
  });

  it("declines medical and out-of-scope questions without loading data or calling the answer model", async () => {
    for (const [label, route] of [
      ["MEDICAL", "MEDICAL"],
      ["OUT_OF_SCOPE", "OUT_OF_SCOPE"],
    ] as const) {
      const answerer = fake("a", "should not be used");
      const loads = { n: 0 };
      const r = await runCoach(deps([fake("c", label)], [answerer], loads), { question: "q", history: [] });
      expect(r.route).toBe(route);
      expect(r.source).toBe("RULE_BASED");
      expect(answerer.calls).toHaveLength(0);
      expect(loads.n).toBe(0);
    }
  });

  it("fails over to the next model on a rate limit and reports which model answered", async () => {
    const r = await runCoach(
      deps(
        [fake("c", "RECOVERY")],
        [fake("groq:big", rateLimited()), fake("openrouter:free", "Rest and hydrate.")],
      ),
      { question: "My legs are sore", history: [] },
    );
    expect(r).toMatchObject({ source: "AI", modelId: "openrouter:free", errors: ["RATE_LIMITED"] });
    expect(r.attempted).toEqual(["c", "groq:big", "openrouter:free"]);
  });

  it("uses the heuristic when the classifier fails, and a grounded rule-based reply when every model fails", async () => {
    const r = await runCoach(
      deps([fake("c", rateLimited())], [fake("a", new Error("boom")), fake("b", "   ")]),
      {
        question: "How many sessions are left in my package?",
        history: [],
      },
    );
    expect(r).toMatchObject({
      classifiedBy: "heuristic",
      topic: "MY_ZURYO",
      route: "ANSWERED",
      source: "RULE_BASED",
      modelId: null,
      errors: ["RATE_LIMITED", "PROVIDER_ERROR", "INVALID_OUTPUT"],
    });
    expect(r.reply).toContain("6 of 10 sessions left");
    expect(r.reply).toContain("Fri, 23 Oct · 10:00 AM");
  });

  it("works with no AI configured at all", async () => {
    const r = await runCoach(deps([], []), { question: "Tips to stay consistent?", history: [] });
    expect(r).toMatchObject({ topic: "HABITS", source: "RULE_BASED", attempted: [] });
    expect(r.reply).toMatch(/consistency/i);
  });

  it("stops trying models once the time budget is spent", async () => {
    let t = 0;
    const slow = fake("slow", "WORKOUT");
    const answerer = fake("a", "never");
    const r = await runCoach(
      {
        ...deps([slow], [answerer]),
        clock: () => {
          t += 40_000; // every look at the clock is 40 s later: past the 30 s budget
          return t;
        },
      },
      { question: "squat form?", history: [] },
    );
    expect(answerer.calls).toHaveLength(0);
    expect(r.source).toBe("RULE_BASED");
  });
});

describe("coach provider selection", () => {
  it("uses both free providers by default, only the selected vendor when forced, and none for Anthropic", () => {
    const ids = (models: ReturnType<typeof coachModelsFromEnv>) => [
      ...models.classifiers.map((m) => m.id),
      ...models.answerers.map((m) => m.id),
    ];
    const auto = ids(coachModelsFromEnv({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }));
    expect(auto.some((id) => id.startsWith("groq:"))).toBe(true);
    expect(auto.some((id) => id.startsWith("openrouter:"))).toBe(true);

    expect(
      ids(coachModelsFromEnv({ AI_PROVIDER: "groq", GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" })).every(
        (id) => id.startsWith("groq:"),
      ),
    ).toBe(true);
    expect(
      ids(
        coachModelsFromEnv({ AI_PROVIDER: "openrouter", GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }),
      ).every((id) => id.startsWith("openrouter:")),
    ).toBe(true);
    expect(
      ids(coachModelsFromEnv({ AI_PROVIDER: "anthropic", GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" })),
    ).toEqual([]);
    expect(ids(coachModelsFromEnv({}))).toEqual([]);
  });
});

describe("coach scope helpers", () => {
  it("flags emergencies and self-harm, and nothing for ordinary training talk", () => {
    expect(safetyGuard("I fainted during cardio")).toBe("EMERGENCY");
    expect(safetyGuard("I want to kill myself")).toBe("SELF_HARM");
    expect(safetyGuard("my chest day was hard")).toBeNull();
    expect(safetyGuard("how do I breathe during planks?")).toBeNull();
  });

  it("reads the first label a model names, and refuses unknown answers", () => {
    expect(parseTopic("WORKOUT")).toBe("WORKOUT");
    expect(parseTopic("Label: medical")).toBe("MEDICAL");
    expect(parseTopic("NUTRITION (also HABITS)")).toBe("NUTRITION");
    expect(parseTopic("I think this is fine")).toBeNull();
  });

  it("classifies by keywords when no model is available", () => {
    expect(heuristicTopic("what should I eat before training")).toBe("NUTRITION");
    expect(heuristicTopic("can I take ibuprofen dosage")).toBe("MEDICAL");
    expect(heuristicTopic("when is my next session")).toBe("MY_ZURYO");
    expect(heuristicTopic("write me a python script")).toBe("OUT_OF_SCOPE");
  });

  it("holds pain and medication questions back as medical, not merely out of scope", () => {
    // The rule-based classifier stands in for the model when no provider answers, and it must
    // route a medical question to the medical refusal rather than the generic one.
    expect(heuristicTopic("Can I take ibuprofen for my knee pain?")).toBe("MEDICAL");
    expect(heuristicTopic("my shoulder aches after training")).toBe("MEDICAL");
    expect(heuristicTopic("how much paracetamol is safe")).toBe("MEDICAL");
    // Training talk that merely mentions training is not medical.
    expect(heuristicTopic("How should I warm up before strength training?")).toBe("WORKOUT");
  });

  it("cleans and bounds model output", () => {
    expect(sanitizeReply("<think>hidden</think>## Plan\n**Squats** are great\n* one\n\n\n\nend")).toBe(
      "Plan\nSquats are great\n- one\n\nend",
    );
    expect(sanitizeReply("Word. ".repeat(600)).length).toBeLessThanOrEqual(COACH_LIMITS.replyChars + 1);
  });

  it("renders the context as labelled data lines", () => {
    const prompt = coachContextToPrompt({ ...ctx, nextSession: null, pkg: null });
    expect(prompt).toContain("Next session: none booked");
    expect(prompt).toContain("Package: none active");
    expect(prompt).not.toMatch(/@|phone|address/i);
  });
});
