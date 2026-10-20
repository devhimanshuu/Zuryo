import { afterEach, describe, expect, it, vi } from "vitest";

/** The server env parser, loaded fresh per test because it caches its first result. */
async function parse(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { getServerEnv } = await import("@/lib/config/env.server");
  return getServerEnv;
}

const DB = "postgresql://u:p@host/zuryo?sslmode=require";

afterEach(() => vi.unstubAllEnvs());

describe("server environment", () => {
  it("treats the empty placeholders from .env.example as unset", async () => {
    const get = await parse({ DATABASE_URL: DB, DIRECT_URL: "", CRON_SECRET: "", OPENROUTER_MODEL: "", ANTHROPIC_MODEL: "" });
    const env = get();
    expect(env.CRON_SECRET).toBeUndefined();
    expect(env.OPENROUTER_MODEL).toBeUndefined();
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it("explains what is wrong when configuration is missing or invalid", async () => {
    const missing = await parse({ DATABASE_URL: "" });
    expect(() => missing()).toThrow(/DATABASE_URL/);
    const shortSecret = await parse({ DATABASE_URL: DB, CRON_SECRET: "too-short" });
    expect(() => shortSecret()).toThrow(/CRON_SECRET must be at least 16 characters/);
  });
});
