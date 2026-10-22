import "server-only";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { DEFAULT_GROQ_MODEL, DEFAULT_OPENROUTER_MODEL, type AiProviderName } from "@/lib/ai/provider";
import type { CoachModel, CoachModels } from "@/lib/coach/graph";

/** Fast model for one-word classification (Groq free tier). */
export const DEFAULT_GROQ_FAST_MODEL = "openai/gpt-oss-20b";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type CoachModelEnv = {
  AI_PROVIDER?: AiProviderName | "auto";
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GROQ_FAST_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  APP_URL?: string;
};

const list = (v: string) =>
  v
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

/**
 * LangChain chat models for the coach, in the order the graph tries them: Groq first (fast, free
 * tier), then OpenRouter's free models (OpenRouter itself routes across the comma-separated list).
 * Retries are off: a failure moves straight to the next model instead of waiting on backoff.
 * An explicit `AI_PROVIDER` restricts the coach to that free-tier vendor; "anthropic" (which the
 * recommendation engine supports but the coach does not) leaves both lists empty, so the coach
 * answers from its rule-based replies. With no keys both lists are empty too.
 */
export function coachModelsFromEnv(env: CoachModelEnv): CoachModels {
  const classifiers: CoachModel[] = [];
  const answerers: CoachModel[] = [];
  const selected = env.AI_PROVIDER ?? "auto";
  const useGroq = selected === "auto" || selected === "groq";
  const useOpenRouter = selected === "auto" || selected === "openrouter";

  if (env.GROQ_API_KEY && useGroq) {
    const groq = (model: string, opts: { temperature: number; maxTokens: number }) =>
      new ChatGroq({
        apiKey: env.GROQ_API_KEY,
        model,
        maxRetries: 0,
        ...opts,
        // gpt-oss models reason before answering; low effort keeps short answers quick.
        ...(model.startsWith("openai/gpt-oss") ? { reasoningEffort: "low" as const } : {}),
      });
    const fast = env.GROQ_FAST_MODEL ?? DEFAULT_GROQ_FAST_MODEL;
    classifiers.push({ id: `groq:${fast}`, model: groq(fast, { temperature: 0, maxTokens: 400 }) });
    for (const m of list(env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL)) {
      answerers.push({ id: `groq:${m}`, model: groq(m, { temperature: 0.5, maxTokens: 1500 }) });
    }
  }

  if (env.OPENROUTER_API_KEY && useOpenRouter) {
    const models = list(env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL);
    const openRouter = (opts: { temperature: number; maxTokens: number }) =>
      new ChatOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        model: models[0],
        maxRetries: 0,
        ...opts,
        // OpenRouter-specific: fall back across the list server-side when a free model is busy.
        ...(models.length > 1 ? { modelKwargs: { models } } : {}),
        configuration: {
          baseURL: OPENROUTER_BASE_URL,
          defaultHeaders: { "X-Title": "Zuryo", ...(env.APP_URL ? { "HTTP-Referer": env.APP_URL } : {}) },
        },
      });
    const id = `openrouter:${models.join(",")}`;
    classifiers.push({ id, model: openRouter({ temperature: 0, maxTokens: 600 }) });
    answerers.push({ id, model: openRouter({ temperature: 0.5, maxTokens: 2000 }) });
  }

  return { classifiers, answerers };
}
