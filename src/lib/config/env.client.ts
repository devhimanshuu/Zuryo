import { z } from "zod";

/**
 * Client-safe environment. Only NEXT_PUBLIC_* values belong here; Next.js inlines them into the
 * browser bundle at build time, so they must never contain secrets.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
