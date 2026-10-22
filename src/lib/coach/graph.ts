import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { coachContextToPrompt, type CoachContext } from "./context";
import { ruleBasedCoachReply } from "./fallback";
import {
  CLASSIFIER_PROMPT,
  COACH_LIMITS,
  COACH_SYSTEM_PROMPT,
  DECLINE_REPLY,
  SAFETY_REPLY,
  heuristicTopic,
  parseTopic,
  routeForTopic,
  safetyGuard,
  type CoachRouteValue,
  type CoachTopic,
  type GuardKind,
} from "./scope";

/**
 * The coach as a LangGraph state graph:
 *
 *   START → guard ──(red flag)──────────────────────────────────────────▶ END   fixed safety reply
 *             └──▶ classify ──(MEDICAL / OUT_OF_SCOPE)──▶ decline ───────▶ END   fixed scope reply
 *                     └──▶ retrieve ──▶ answer ──(a model answered)─────▶ END
 *                                         └──(every model failed)──▶ fallback ──▶ END   rule-based
 *
 * Models are injected (LangChain chat models in the app, fakes in tests) and tried in order, so a
 * rate limit or timeout on Groq moves on to OpenRouter. Every path ends with a reply.
 */

export type CoachTurn = { role: "USER" | "ASSISTANT"; content: string };

type ModelReply = {
  content: unknown;
  usage_metadata?: { input_tokens?: number; output_tokens?: number };
  response_metadata?: Record<string, unknown>;
};

/** A chat model with a label for logs; anything with LangChain's `invoke` shape works. */
export type CoachModel = {
  id: string;
  model: { invoke(messages: BaseMessage[], options?: { signal?: AbortSignal }): Promise<ModelReply> };
};

export type CoachModels = { classifiers: CoachModel[]; answerers: CoachModel[] };

export type CoachGraphDeps = {
  models: CoachModels;
  /** Loads the customer's own data; only called for questions the coach will answer. */
  loadContext: () => Promise<CoachContext>;
  /** Wall clock in ms (injectable for tests). */
  clock?: () => number;
};

export const COACH_TIMEOUTS = { classifyMs: 8_000, answerMs: 20_000, totalMs: 30_000 } as const;

type Usage = { inputTokens: number; outputTokens: number };

const CoachState = Annotation.Root({
  question: Annotation<string>,
  history: Annotation<CoachTurn[]>,
  /** Epoch ms after which no further model is tried. */
  deadline: Annotation<number>,
  /** Set by the guard node when the message hit a safety red flag. */
  safetyFlag: Annotation<GuardKind | null>,
  topic: Annotation<CoachTopic | null>,
  classifiedBy: Annotation<string | null>,
  context: Annotation<CoachContext | null>,
  reply: Annotation<string | null>,
  route: Annotation<CoachRouteValue | null>,
  source: Annotation<"AI" | "RULE_BASED" | null>,
  modelId: Annotation<string | null>,
  /** Failure kinds of every model attempt that didn't produce an answer, in order. */
  errors: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  /** Every model that was called, answered or not (a logged request needs at least one). */
  attempted: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  usage: Annotation<Usage>({
    reducer: (a, b) => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }),
    default: () => ({ inputTokens: 0, outputTokens: 0 }),
  }),
});

export type CoachState = typeof CoachState.State;
export type CoachResult = Pick<
  CoachState,
  "reply" | "route" | "source" | "modelId" | "topic" | "classifiedBy" | "errors" | "attempted" | "usage"
> & { guard: GuardKind | null };

/** Text out of a LangChain message: a string, or the text parts of a content array. */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : part && typeof part === "object" && (part as { type?: unknown }).type === "text"
            ? String((part as { text?: unknown }).text ?? "")
            : "",
      )
      .join("");
  }
  return "";
}

/** Cleans a model answer for display: no hidden reasoning, headings or bold markers; bounded length. */
export function sanitizeReply(text: string): string {
  let out = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/[ 	]+$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (out.length > COACH_LIMITS.replyChars) {
    const cut = out.slice(0, COACH_LIMITS.replyChars);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
    out = `${cut.slice(0, end > 200 ? end + 1 : cut.length).trim()}…`;
  }
  return out;
}

/** Short failure kind for logs: no messages, bodies or stack traces. */
export function failureKind(err: unknown): string {
  const e = err as { status?: unknown; name?: unknown; message?: unknown; code?: unknown };
  const message = typeof e?.message === "string" ? e.message : "";
  if (e?.status === 429 || /rate.?limit|429/i.test(message)) return "RATE_LIMITED";
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || /abort|timed? ?out/i.test(message)) return "TIMEOUT";
  if (e?.code === "INVALID_OUTPUT") return "INVALID_OUTPUT";
  return "PROVIDER_ERROR";
}

function invalidOutput(): Error {
  return Object.assign(new Error("The model returned no usable answer"), { code: "INVALID_OUTPUT" });
}

const usageOf = (r: ModelReply): Usage => ({
  inputTokens: r.usage_metadata?.input_tokens ?? 0,
  outputTokens: r.usage_metadata?.output_tokens ?? 0,
});

/** The model that actually answered, when a router (OpenRouter) reports it. */
function servedModel(fallbackId: string, r: ModelReply): string {
  const name = r.response_metadata?.model_name ?? r.response_metadata?.model;
  if (typeof name !== "string" || !name) return fallbackId;
  const provider = fallbackId.split(":")[0];
  return `${provider}:${name}`;
}

function historyMessages(history: CoachTurn[]): BaseMessage[] {
  return history
    .slice(-COACH_LIMITS.historyMessages)
    .map((t) => (t.role === "USER" ? new HumanMessage(t.content) : new AIMessage(t.content)));
}

export function buildCoachGraph(deps: CoachGraphDeps) {
  const clock = deps.clock ?? Date.now;
  const timeLeft = (s: CoachState) => s.deadline - clock();

  async function guard(s: CoachState): Promise<Partial<CoachState>> {
    const kind = safetyGuard(s.question);
    return kind
      ? { safetyFlag: kind, route: "SAFETY", source: "RULE_BASED", reply: SAFETY_REPLY[kind] }
      : { safetyFlag: null };
  }

  async function classify(s: CoachState): Promise<Partial<CoachState>> {
    const recent = s.history
      .slice(-4)
      .map((t) => `${t.role === "USER" ? "Customer" : "Coach"}: ${t.content.slice(0, 300)}`)
      .join("\n");
    const messages = [
      new SystemMessage(CLASSIFIER_PROMPT),
      new HumanMessage(`${recent ? `Earlier messages:\n${recent}\n\n` : ""}Latest message:\n${s.question}`),
    ];
    const errors: string[] = [];
    const attempted: string[] = [];
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    for (const { id, model } of deps.models.classifiers) {
      const budget = Math.min(COACH_TIMEOUTS.classifyMs, timeLeft(s));
      if (budget <= 500) break;
      attempted.push(id);
      try {
        const r = await model.invoke(messages, { signal: AbortSignal.timeout(budget) });
        usage = usageOf(r);
        const topic = parseTopic(messageText(r.content));
        if (!topic) throw invalidOutput();
        return { topic, classifiedBy: id, errors, attempted, usage };
      } catch (err) {
        errors.push(failureKind(err));
      }
    }
    return { topic: heuristicTopic(s.question), classifiedBy: "heuristic", errors, attempted, usage };
  }

  async function decline(s: CoachState): Promise<Partial<CoachState>> {
    const topic = s.topic === "MEDICAL" ? "MEDICAL" : "OUT_OF_SCOPE";
    return { route: topic, source: "RULE_BASED", reply: DECLINE_REPLY[topic] };
  }

  async function retrieve(): Promise<Partial<CoachState>> {
    return { context: await deps.loadContext() };
  }

  async function answer(s: CoachState): Promise<Partial<CoachState>> {
    const messages = [
      new SystemMessage(`${COACH_SYSTEM_PROMPT}\n\nCustomer data:\n${coachContextToPrompt(s.context!)}`),
      ...historyMessages(s.history),
      new HumanMessage(s.question),
    ];
    const errors: string[] = [];
    const attempted: string[] = [];
    for (const { id, model } of deps.models.answerers) {
      const budget = Math.min(COACH_TIMEOUTS.answerMs, timeLeft(s));
      if (budget <= 1_000) break;
      attempted.push(id);
      try {
        const r = await model.invoke(messages, { signal: AbortSignal.timeout(budget) });
        const reply = sanitizeReply(messageText(r.content));
        if (reply.length < 2) throw invalidOutput();
        return {
          reply,
          route: "ANSWERED",
          source: "AI",
          modelId: servedModel(id, r),
          errors,
          attempted,
          usage: usageOf(r),
        };
      } catch (err) {
        errors.push(failureKind(err));
      }
    }
    return { errors, attempted };
  }

  async function fallback(s: CoachState): Promise<Partial<CoachState>> {
    const topic = s.topic && s.topic !== "MEDICAL" && s.topic !== "OUT_OF_SCOPE" ? s.topic : "WORKOUT";
    return { route: "ANSWERED", source: "RULE_BASED", modelId: null, reply: ruleBasedCoachReply(topic, s.context!) };
  }

  return new StateGraph(CoachState)
    .addNode("guard", guard)
    .addNode("classify", classify)
    .addNode("decline", decline)
    .addNode("retrieve", retrieve)
    .addNode("answer", answer)
    .addNode("fallback", fallback)
    .addEdge(START, "guard")
    .addConditionalEdges("guard", (s) => (s.route ? END : "classify"), ["classify", END])
    .addConditionalEdges(
      "classify",
      (s) => (routeForTopic(s.topic ?? "OUT_OF_SCOPE") === "ANSWERED" ? "retrieve" : "decline"),
      ["retrieve", "decline"],
    )
    .addEdge("decline", END)
    .addEdge("retrieve", "answer")
    .addConditionalEdges("answer", (s) => (s.reply ? END : "fallback"), ["fallback", END])
    .addEdge("fallback", END)
    .compile();
}

/** Runs one question through the graph. Never throws for model failures; every path has a reply. */
export async function runCoach(
  deps: CoachGraphDeps,
  input: { question: string; history: CoachTurn[] },
): Promise<CoachResult> {
  const clock = deps.clock ?? Date.now;
  const graph = buildCoachGraph(deps);
  const s = await graph.invoke({
    question: input.question,
    history: input.history,
    deadline: clock() + COACH_TIMEOUTS.totalMs,
    safetyFlag: null,
    topic: null,
    classifiedBy: null,
    context: null,
    reply: null,
    route: null,
    source: null,
    modelId: null,
  });
  return {
    reply: s.reply,
    route: s.route,
    source: s.source,
    modelId: s.modelId,
    topic: s.topic,
    classifiedBy: s.classifiedBy,
    errors: s.errors,
    attempted: s.attempted,
    usage: s.usage,
    guard: s.safetyFlag,
  };
}
