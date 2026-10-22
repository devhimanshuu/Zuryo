import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against the disposable test database (never the demo database). The dev server
 * is started by Playwright with DATABASE_URL pointing at the test database, and the global setup
 * truncates + re-seeds it first. Requires Chromium (`npx playwright install chromium`).
 */
const testUrl = process.env.TEST_DATABASE_URL;
const testDirectUrl = process.env.TEST_DIRECT_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is not set — E2E needs the disposable test database.");

/**
 * The suite runs on its own port (3100 by default), not the app's usual 3000. `reuseExistingServer`
 * is false — the E2E server must be a clean process against the test database — so without a
 * dedicated port a developer's `next dev` (or a preview server) would abort the whole run with
 * "port is already used". Override with E2E_PORT when 3100 is taken too.
 *
 * The server is a **production build** (`next build` + `next start`), not `next dev`. Dev mode
 * compiles each route on first hit and that costs 10–30 s per page here; a navigation in the
 * middle of a booking flow would blow through Playwright's action timeouts and report the app as
 * broken when it is merely still compiling. A built server answers every route at full speed and
 * also proves the artefact the assessment actually ships works, HMR noise included.
 *
 * The host is **`localhost`, not `127.0.0.1`**, and that is load-bearing. Next.js canonicalises a
 * request's URL to its own configured hostname: a role-mismatch redirect issued for a browser on
 * `http://127.0.0.1:3100` comes back as `Location: http://localhost:3100/customer`, even when the
 * app builds the URL from the incoming `Host` header. The browser then follows that cross-origin,
 * the httpOnly session cookie is not sent, and middleware bounces it to `/sign-in` — a signed-in
 * user appears signed out. Serving and browsing on the same canonical host keeps the redirect
 * same-origin. Verified by reading the middleware's own `Location` header with both hosts.
 */
const port = process.env.E2E_PORT ?? "3100";
const baseURL = `http://localhost:${port}`;

/** Environment for the Playwright-spawned dev server: the disposable DB, never the demo DB. */
const serverEnv: Record<string, string> = {
  ...process.env,
  DATABASE_URL: testUrl,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-local-secret-not-for-production-use",
  // No AI keys: every recommendation uses the deterministic rule-based fallback during E2E, and
  // the coach answers from its rule-based replies. Every provider key is blanked, so a developer's
  // local free-tier key can't turn these specs into live (and non-deterministic) API calls.
  ANTHROPIC_API_KEY: "",
  OPENROUTER_API_KEY: "",
  GROQ_API_KEY: "",
};
if (testDirectUrl) serverEnv.DIRECT_URL = testDirectUrl;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npx next start -H localhost -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 600_000,
    env: serverEnv,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
