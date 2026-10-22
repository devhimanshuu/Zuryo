import "server-only";
import { z } from "zod";

/** An optional variable where an empty string (`KEY=""`, as in .env.example) means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

/**
 * Server-only environment. Importing this file from a client component fails the build
 * (via `server-only`), so secrets can never reach the browser bundle.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is missing. Copy .env.example to .env and add your Neon pooled URL." })
    .url("DATABASE_URL must be a postgres:// or postgresql:// URL.")
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must start with postgresql://"),
  DIRECT_URL: optional(z.string().url()),
  /** Bearer token for /api/cron/session-lifecycle. Unset = the endpoint is disabled. */
  CRON_SECRET: optional(z.string().min(16, "CRON_SECRET must be at least 16 characters")),
  /**
   * AI features (workout recommendations and the fitness coach). "auto" chains Groq then
   * OpenRouter for whichever keys are set; an explicit value uses only that vendor. The coach has
   * no Anthropic client, so with "anthropic" it answers from curated replies while recommendations
   * use Anthropic. With no key at all both features use their rule-based replies (labelled as such).
   */
  AI_PROVIDER: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(["auto", "groq", "openrouter", "anthropic"]).default("auto"),
  ),
  GROQ_API_KEY: optional(z.string()),
  /** Groq model id, or a comma-separated list tried in order (default: src/lib/ai/provider.ts). */
  GROQ_MODEL: optional(z.string()),
  /** Small, fast Groq model the coach uses to classify questions (default: openai/gpt-oss-20b). */
  GROQ_FAST_MODEL: optional(z.string()),
  OPENROUTER_API_KEY: optional(z.string()),
  /** OpenRouter model id, or a comma-separated fallback list (default: see src/lib/ai/provider.ts). */
  OPENROUTER_MODEL: optional(z.string()),
  ANTHROPIC_API_KEY: optional(z.string()),
  /** Anthropic model id; defaults to claude-haiku-5-5. */
  ANTHROPIC_MODEL: optional(z.string()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parsed lazily so `next build` can run without a database configured. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
