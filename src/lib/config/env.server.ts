import "server-only";
import { z } from "zod";

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
  DIRECT_URL: z.string().url().optional(),
  /** Bearer token for /api/cron/session-lifecycle. Unset = the endpoint is disabled. */
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters").optional(),
  /** Anthropic API key for AI workout recommendations. Unset = the deterministic fallback is used. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Model id for recommendations, e.g. claude-3-5-haiku-latest. */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-3-5-haiku-latest"),
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
