import type { BaseMessage } from "@langchain/core/messages";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CoachModel, CoachModels } from "@/lib/coach/graph";
import { askCoach, clearCoachHistory, getCoachThread, type CoachDeps } from "@/server/coach/coach-service";
import { getAiUsage } from "@/server/fitness/fitness-service";
import { NOW, alice, arun, bob, createTestDb, resetAndSeed, testDeps } from "./helpers";

const db = createTestDb();

beforeEach(() => resetAndSeed(db));
afterAll(() => db.$disconnect());

type FakeModel = CoachModel & { calls: BaseMessage[][] };

function fake(id: string, answer: string | Error): FakeModel {
  const calls: BaseMessage[][] = [];
  return {
    id,
    calls,
    model: {
      async invoke(messages: BaseMessage[]) {
        calls.push(messages);
        if (answer instanceof Error) throw answer;
        return { content: answer, usage_metadata: { input_tokens: 120, output_tokens: 30 } };
      },
    },
  };
}

const rateLimited = () => Object.assign(new Error("429 Too Many Requests"), { status: 429 });

function deps(models: CoachModels): CoachDeps {
  return { ...testDeps(db), models };
}

/** Classifies as WORKOUT and answers with one short sentence. */
function workingModels() {
  return {
    classifiers: [fake("groq:fast", "WORKOUT")],
    answerers: [fake("groq:big", "Warm up for five minutes, then start easy.")],
  };
}

describe("coach chat", () => {
  it("answers with the customer's own context, stores the thread and logs coach usage", async () => {
    const models = workingModels();
    const res = await askCoach(deps(models), alice, { message: "How should I warm up?" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      role: "ASSISTANT",
      content: "Warm up for five minutes, then start easy.",
      source: "AI",
      route: "ANSWERED",
      modelId: "groq:big",
    });

    const rows = await db.chatMessage.findMany({
      where: { customerId: alice.userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(rows.map((r) => r.role)).toEqual(["USER", "ASSISTANT"]);
    expect(rows[1]).toMatchObject({ route: "ANSWERED", source: "AI", modelId: "groq:big" });

    // The system prompt carries the bounded customer data (name, package state), no contact details.
    const sent = models.answerers[0]!.calls[0]!;
    const system = String(sent[0]!.content);
    expect(system).toContain("Alice");
    expect(system).toContain("none active");
    expect(system).not.toMatch(/@|Tower A/);

    const log = await db.aiRequestLog.findFirstOrThrow({
      where: { customerId: alice.userId, feature: "COACH" },
    });
    expect(log).toMatchObject({ feature: "COACH", source: "AI", outcome: "SUCCESS", modelId: "groq:big" });
    // One classification call plus one answer call, summed by the graph.
    expect(log.inputTokens).toBe(240);
    expect(log.outputTokens).toBe(60);
  });

  it("sends earlier messages as history, still scoped to that customer", async () => {
    const aliceAnswerer = fake("groq:big", "Answer.");
    const aliceModels = { classifiers: [fake("groq:fast", "WORKOUT")], answerers: [aliceAnswerer] };
    await askCoach(deps(aliceModels), alice, { message: "First question about squats" });
    await askCoach(deps(aliceModels), alice, { message: "And for beginners?" });
    // system + two history messages + the new question
    expect(aliceAnswerer.calls[1]).toHaveLength(4);
    const texts = aliceAnswerer.calls[1]!.map((m) => String(m.content));
    expect(texts.some((t) => t.includes("First question about squats"))).toBe(true);

    const bobAnswerer = fake("openrouter:free", "Hi Bob.");
    await askCoach(
      deps({ classifiers: [fake("groq:fast", "WORKOUT")], answerers: [bobAnswerer] }),
      bob,
      { message: "How should I warm up?" },
    );
    const bobSystem = String(bobAnswerer.calls[0]![0]!.content);
    expect(bobSystem).toContain("Bob");
    expect(bobSystem).not.toContain("Alice");
    expect(bobAnswerer.calls[0]!.some((m) => String(m.content).includes("squats"))).toBe(false);

    expect(await getCoachThread(db, alice.userId)).toHaveLength(4);
    expect(await getCoachThread(db, bob.userId)).toHaveLength(2);
  });

  it("holds medical questions back with a fixed reply and no model call", async () => {
    const answerer = fake("groq:big", "should not be used");
    const res = await askCoach(
      deps({ classifiers: [fake("groq:fast", "MEDICAL")], answerers: [answerer] }),
      alice,
      { message: "Can I take ibuprofen for my knee pain?" },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ source: "RULE_BASED", route: "MEDICAL", modelId: null });
    expect(res.data.content).toMatch(/doctor or physiotherapist/i);
    expect(answerer.calls).toHaveLength(0);
  });

  it("answers emergencies from the safety guard before any model is called", async () => {
    const classifier = fake("groq:fast", "WORKOUT");
    const answerer = fake("groq:big", "should not be used");
    const res = await askCoach(deps({ classifiers: [classifier], answerers: [answerer] }), alice, {
      message: "I felt chest pain during my workout today",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ source: "RULE_BASED", route: "SAFETY" });
    expect(res.data.content).toMatch(/112/);
    expect(classifier.calls).toHaveLength(0);
    expect(answerer.calls).toHaveLength(0);
  });

  it("falls back to a grounded rule-based answer when every model fails, and records the failure kind", async () => {
    const res = await askCoach(
      deps({ classifiers: [fake("groq:fast", rateLimited())], answerers: [fake("groq:big", rateLimited())] }),
      alice,
      { message: "How many sessions are left in my package?" },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ route: "ANSWERED", source: "RULE_BASED", modelId: null });
    expect(res.data.content).toMatch(/no session booked|don't have a session/i);
    const log = await db.aiRequestLog.findFirstOrThrow({ where: { customerId: alice.userId } });
    expect(log).toMatchObject({ feature: "COACH", source: "RULE_BASED", outcome: "SUCCESS", errorKind: "RATE_LIMITED" });
  });

  it("enforces the per-minute limit before calling the models", async () => {
    const models = workingModels();
    for (let i = 0; i < 6; i++) {
      const okRes = await askCoach(deps(models), alice, { message: `Question number ${i} about squats` });
      expect(okRes.ok).toBe(true);
    }
    const answerCalls = models.answerers[0]!.calls.length;
    const seventh = await askCoach(deps(models), alice, { message: "One more question about planks" });
    expect(seventh.ok).toBe(false);
    if (!seventh.ok) expect(seventh.error.code).toBe("CONFLICT");
    expect(models.answerers[0]!.calls).toHaveLength(answerCalls);
    expect(await db.chatMessage.count({ where: { customerId: alice.userId, role: "USER" } })).toBe(6);
  });

  it("rejects invalid messages and non-customers without storing anything", async () => {
    const empty = await askCoach(deps(workingModels()), alice, { message: " " });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("VALIDATION");

    const forbidden = await askCoach(deps(workingModels()), arun, { message: "How should I warm up?" });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");

    expect(await db.chatMessage.count()).toBe(0);
    expect(await db.aiRequestLog.count()).toBe(0);
  });

  it("clears only the asking customer's conversation", async () => {
    await askCoach(deps(workingModels()), alice, { message: "How should I warm up?" });
    await askCoach(deps(workingModels()), bob, { message: "How should I warm up?" });
    const cleared = await clearCoachHistory(testDeps(db), alice);
    expect(cleared.ok).toBe(true);
    expect(await getCoachThread(db, alice.userId)).toHaveLength(0);
    expect(await getCoachThread(db, bob.userId)).toHaveLength(2);

    const forbidden = await clearCoachHistory(testDeps(db), arun);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("FORBIDDEN");
  });

  it("keeps recommendation usage figures separate from coach questions", async () => {
    await askCoach(deps(workingModels()), alice, { message: "How should I warm up?" });
    await db.aiRequestLog.create({
      data: { customerId: alice.userId, feature: "RECOMMENDATION", source: "AI", outcome: "SUCCESS", modelId: "test" },
    });
    const rows = await db.aiRequestLog.findMany({ where: { customerId: alice.userId } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.feature === "COACH")?.createdAt.getTime()).toBe(NOW.getTime());
    const usage = await getAiUsage(db);
    expect(usage.aiSuccess).toBe(1);
    expect(usage.fallback).toBe(0);
  });
});
