import "server-only";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import type { CoachModel, CoachModels } from "@/lib/coach/graph";

/** Fast model for one-word classification (Groq free tier). */
export const DEFAULT_GROQ_FAST_MODEL = "openai/gpt-oss-20b";
/** A vendor the coach can be restricted to; "auto" uses every vendor that has a key. */
export type AiProviderName = "groq" | "openrouter";

/**
 * Default Groq models (free tier), tried in order: gpt-oss-120b for quality, then Qwen, then the
 * small gpt-oss. Groq's catalogue changes; set GROQ_MODEL (comma-separated) to override.
 */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b";
/**
 * Default OpenRouter models, free tier only, tried in order. Free models are rate limited and their
 * availability changes (verified live 2026-10-23); set OPENROUTER_MODEL to override. Only ids ending
 * in ":free" are ever called.
 */
export const DEFAULT_OPENROUTER_MODEL =
  "nvidia/nemotron-3-ultra-550b-a55b:free,recursive/flint-v1.0:free,poolside/laguna-s-2.1:free,google/gemma-4-31b-it:free,openrouter/free";
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

/** OpenRouter bills anything without the ":free" suffix, so such ids are dropped, not called. */
export const isFreeOpenRouterModel = (id: string) => id.endsWith(":free");

/**
 * LangChain chat models for the coach, in the order the graph tries them: every Groq model first
 * (fast, free tier), then every free OpenRouter model, each as its own entry in the failover list.
 * Retries are off: a failure moves straight to the next model instead of waiting on backoff.
 * An explicit `AI_PROVIDER` restricts the coach to that free-tier vendor. With no keys both lists are
 * empty, so the coach answers from its rule-based replies.
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
    // One entry per model, so the graph's own failover walks the list: a busy or retired free model
    // costs one quick failure, not the whole turn. Only ":free" models are ever called.
    const models = list(env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL).filter(isFreeOpenRouterModel);
    const openRouter = (model: string, opts: { temperature: number; maxTokens: number }) =>
      new ChatOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        model,
        maxRetries: 0,
        ...opts,
        configuration: {
          baseURL: OPENROUTER_BASE_URL,
          defaultHeaders: { "X-Title": "Zuryo", ...(env.APP_URL ? { "HTTP-Referer": env.APP_URL } : {}) },
        },
      });
    // Classifying is a one-word job: the first two free models are plenty.
    for (const m of models.slice(0, 2)) {
      classifiers.push({ id: `openrouter:${m}`, model: openRouter(m, { temperature: 0, maxTokens: 600 }) });
    }
    for (const m of models) {
      answerers.push({ id: `openrouter:${m}`, model: openRouter(m, { temperature: 0.5, maxTokens: 2000 }) });
    }
  }

  return { classifiers, answerers };
}
