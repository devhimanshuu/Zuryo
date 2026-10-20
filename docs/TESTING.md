# Zuryo — Testing and Evidence

All results below were produced on 2026-10-21 on the author's Windows machine against Neon
PostgreSQL (us-east-2) and the Vercel deployment at https://zuryo-one.vercel.app. Nothing here is
simulated output; where something was not run it says so.

## Suites

| Suite                                                       | Command                                                    | Needs                                                                        | Result                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Type check                                                  | `npm run typecheck`                                        | —                                                                            | no errors                                                                             |
| Lint                                                        | `npm run lint`                                             | —                                                                            | no errors                                                                             |
| Unit tests (pure rules, validation, seed, env, AI provider) | `npm test`                                                 | —                                                                            | **16 files, 185 tests passed** (~9 s)                                                 |
| Production build                                            | `npm run build`                                            | `DATABASE_URL` etc.                                                          | succeeded; 23 routes + middleware                                                     |
| Database integration                                        | `npm run test:integration`                                 | `TEST_DATABASE_URL`, `TEST_DIRECT_URL` (disposable DB; truncated every test) | **100 tests / 10 files, all passed** — see note                                       |
| Browser E2E                                                 | `npm run test:e2e`                                         | Chromium, test DB; builds and serves the app on port 3100                    | **15 passed, 15 skipped** in the full run (skips are desktop-only specs under the mobile project); the new `session-timer.spec.ts` was then run alone and passed (1 passed) |
| Deployed HTTP smoke                                         | `bash scripts/smoke.sh https://zuryo-one.vercel.app`       | —                                                                            | **27 checks passed, 0 failed**                                                        |
| Deployed browser smoke                                      | `node scripts/live-smoke.mjs https://zuryo-one.vercel.app` | Chromium; writes then cancels one demo booking                               | **8 steps passed**                                                                    |
| Live AI call                                                | `npm run ai:smoke`                                         | `OPENROUTER_API_KEY`                                                         | **failed: HTTP 429 (rate limited)** — see AI section                                  |

**Integration run note.** The first full run finished 95 passed / 5 failed. All five failures were in
`cancellation.test.ts` and were the harness losing its Neon connection (`Hook timed out in 120000ms`,
`Server has closed the connection`), not assertion failures. The file was re-run alone and all 8 tests
passed. So every test passed at least once, but not in a single uninterrupted run; the suite takes ~25
minutes from this machine because of per-query latency.

**E2E notes.** Two test defects were fixed during this phase (not app defects): the cancel journey
clicked only the dialog trigger, not the dialog's confirm button; the sign-out test clicked before
React hydration. After the fixes the full suite passed (15/15 run).

## Business rules and where they are covered

| Rule                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Double-booking protection**  | `tests/integration/concurrency.test.ts` (parallel requests for one slot; mixed instant/scheduled; idempotent retries), `reschedule.test.ts` (two concurrent moves into one slot; move racing a new booking), `cancellation.test.ts` (simultaneous cancels: one wins). DB exclusion constraints exist as a backstop. All passed.                                                                                                                                                                                                                                                                    |
| **Price manipulation**         | Booking input schema has no price field; `PRICE_CHANGED` asserted in `booking.test.ts` and `reschedule.test.ts`; `pricing.test.ts` asserts 399 → 39.90 → 438.90 and the 499 case. Live review screen showed 399.00 + 39.90 = 438.90.                                                                                                                                                                                                                                                                                                                                                               |
| **Package idempotency**        | `packages-payments.test.ts` and `reschedule.test.ts` (a package booking is never debited twice; refund once); unique `(bookingId, reason)` ledger constraint. Live: three package book-and-cancel cycles on the demo database (two leftover smoke bookings were cancelled by hand) left `seed_pkg_priya` at used 4 / 10 with a ledger sum of 4, i.e. `usedSessions` equals the ledger.                                                                                                                                                                                                             |
| **Session timer persistence**  | `tests/integration/session-lifecycle.test.ts` and `tests/session-lifecycle.test.ts`: server-written start/end, repeated start returns the same deadline, warning and completion fire once, late reconciliation records `completedAt = endsAt`. Time is injected, so 55/60-minute behaviour was tested without waiting. Browser check: `e2e/session-timer.spec.ts` starts a session as the trainer, sees the countdown, reloads (not reset), and loads the page under a device clock two hours fast (unchanged); the customer page shows "In progress". **Not run:** waiting out a real 60 minutes. |
| **AI fallback**                | `tests/ai-provider.test.ts`, `tests/fitness-recommendation.test.ts`, integration `fitness.test.ts`, E2E `fitness.spec.ts` (rule-based plan is labelled and bookable; one-per-minute cooldown). The live 429 on 2026-10-21 is itself an instance of the provider-failure path, though that run was the standalone smoke script, not the app.                                                                                                                                                                                                                                                        |
| **Customer/trainer isolation** | `integration/auth.test.ts`, `cancellation.test.ts` ("does not let a customer cancel or discover someone else's booking", same for trainers), `reschedule.test.ts`; E2E `auth.spec.ts` (a customer cannot enter another workspace); `smoke.sh` role isolation on the deployment (6 cross-role requests, none returned 200).                                                                                                                                                                                                                                                                         |

## Live deployment verification

- Public pages `/`, `/how-it-works`, `/sign-in` → 200. Anonymous `/customer`, `/trainer`, `/operations` → 307 to sign-in.
- Seeded customer, trainer and operations accounts sign in; every workspace page listed in `smoke.sh` returns 200 for its own role.
- `/api/cron/session-lifecycle` with a wrong bearer → 401 (the endpoint is configured; no scheduler calls it).
- Browser smoke: customer books a scheduled Strength session (review screen shows ₹399.00 + ₹39.90 = ₹438.90), booking appears in history, packages page shows the "Demo checkout — no real money is charged" label, fitness page loads, operations pricing shows 399/499, trainer sessions page loads, and the smoke booking is cancelled.

### Deployment defects found and fixed

1. Environment values pushed from a CRLF/single-quoted local `.env` were malformed (`DATABASE_URL must start with postgresql://`). Fixed by re-adding them cleanly.
2. Every database call failed on Vercel with `ENOENT … query_compiler_bg.wasm`. Fixed with `outputFileTracingIncludes` in `next.config.ts`.
3. The first alias I probed (`zuryo.vercel.app`) belongs to someone else's project; the real alias is `zuryo-one.vercel.app`.

## Not run / limits on the claims

- Live LLM output on 2026-10-21 (429); latency/token figures in ARCHITECTURE §J are from 2026-10-20 runs.
- The Anthropic provider has never been called live.
- Pricing edits and production package purchase through the live UI were not exercised on the deployment (covered by integration/E2E on the test DB).
- Mobile-layout checks (`e2e/quality.spec.ts`) are part of the Playwright run; no real-device testing.
- No load or performance testing; no accessibility audit beyond role-based Playwright selectors.
- No scheduled job runs automatically in production.
