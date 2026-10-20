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
   * AI workout recommendations. OPENROUTER_API_KEY wins when both keys are set; with neither, every
   * recommendation uses the deterministic rule-based fallback (labelled as such in the UI).
   */
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
