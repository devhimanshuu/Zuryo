# ZuryoFit — Testing and Evidence

The app has four test layers: pure unit tests, database integration tests, Playwright browser
journeys and HTTP/browser smoke scripts against a deployment. This document lists the commands, what
each layer covers, and the results actually observed. Where something was not run, it says so.

## How to run the suites

| Command                             | Needs                                                                         | What it proves                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                 | —                                                                             | TypeScript strict mode compiles                                                                    |
| `npm run lint`                      | —                                                                             | ESLint (Next.js config + Prettier-compatible rules)                                                |
| `npm test`                          | —                                                                             | Pure rules, validation, seed plan, pricing, pagination, CSV/ICS, coach logic, theme                |
| `npm run test:integration`          | `TEST_DATABASE_URL`, `TEST_DIRECT_URL` (disposable DB — every test truncates) | Real Postgres: constraints, locks, transactions, lifecycle, notifications, coach, pagination       |
| `npm run test:e2e`                  | Chromium (`npx playwright install chromium`), test DB                         | Real browser journeys against a production build served on port 3100                               |
| `npm run build`                     | `DATABASE_URL` and the other server env vars                                  | The deployable artifact compiles and all routes build                                              |
| `bash scripts/smoke.sh <url>`       | A running deployment                                                          | Public pages, sign-in for each role, workspace isolation, cron token                               |
| `node scripts/live-smoke.mjs <url>` | Chromium and a demo database                                                  | Books a session, checks the price breakdown, loads the packages/trainer pages, cancels the booking |
| `npm run coach:smoke`               | `GROQ_API_KEY` or `OPENROUTER_API_KEY`                                        | One live coach question through the real provider chain, printing the route and model              |

## Latest results (2026-10-23)

| Suite                             | Result                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type check                        | **passed**, no errors                                                                                                                                                                                   |
| Lint                              | **passed**, no warnings                                                                                                                                                                                 |
| Unit tests                        | **31 files, 275 tests passed** (~15 s), including the new operations-filter and pagination suites                                                                                                       |
| Database integration (2026-10-23) | **60 tests passed across five files**: booking (17), packages/payments (15), account + auth (26), operations trainer detail (2). A single uninterrupted full run was not completed — see the note below |
| Operations trainer detail         | **2 tests passed** (new file: stats, upcoming, history order, notes/feedback, unknown trainer) against the disposable DB                                                                                |
| Production build                  | **passed** (`prisma generate && next build`); all routes, middleware and static assets built                                                                                                            |
| Browser E2E (last full run)       | **18 passed, 18 skipped** (36 runs across desktop and mobile, 2026-10-22). Not re-run on 2026-10-23 — see the note below                                                                                |
| Deployed HTTP smoke               | **27 checks passed, 0 failed** (2026-10-21, https://zuryo-one.vercel.app)                                                                                                                               |
| Live URL check                    | **`DEPLOYMENT_NOT_FOUND`** on 2026-10-23 — the alias needs a redeploy before submission                                                                                                                 |
| Deployed browser smoke            | **8 steps passed** (2026-10-21): sign-in, booking, price check, cancellation                                                                                                                            |
| Live coach check                  | **passed** 2026-10-22 via Groq; the safety guard and scope refusals were exercised without model calls                                                                                                  |
| Manual UI check                   | 2026-10-23: signed in as operations, opened a trainer profile, confirmed history, notes, feedback and empty states render                                                                               |

**Integration run note.** The suite is slow from this machine because each query is a network round
trip to Neon (us-east-2): files take roughly 2–4 minutes each, and the suite runs one file at a time
because every test truncates the same test database. A full start-to-finish run takes 25–40 minutes
and did not complete on 2026-10-23; the five files above were run in clean batches instead. An
earlier full run finished with 95 passed / 5 failed where every failure was the harness losing its
Neon connection (`Hook timed out`, `Server has closed the connection`), not an assertion; re-running
those files alone passed. Do not run two integration/E2E commands at once — they truncate the same
database and will fail on foreign keys.

**E2E note.** The suite builds and serves the app on port 3100 against the test database, so it
cannot run at the same time as the integration suite (both truncate that database). The last full
run was green on 2026-10-22; the test helper signs in by pressing Enter in the password field, after
an earlier flake where a lazily painted image sat over the submit button.

## What the suites cover

**Unit tests (`tests/*.test.ts`, 31 files).** Booking rules and validation; matching and ranking;
pricing and peak-window configuration; package arithmetic and ledger rules; session lifecycle and
`buzzerCue()`; pagination helpers; operations filter parsing; CSV quoting and ICS export; seed-plan
determinism; environment parsing; coach scope, context, suggestions, follow-ups and export; theme,
activity streaks and trend maths; navigation and auth callback safety.

**Integration tests (`tests/integration/*.test.ts`, 16 files).** Booking, availability, cancellation,
reschedule, concurrency and idempotency against real Postgres; packages and simulated payments;
session lifecycle and session records; fitness profile and goal tracking; coach thread, scope,
safety, rate limits and fallback; pagination totals and isolation; live-session reconciliation; auth
and role isolation; sign-up, Google sign-up completion and account updates; trainer location
matching; and the operations trainer detail query added on 2026-10-23.

**Browser E2E (`e2e/*.spec.ts`, 18 tests).** Sign-in and role isolation, sign-up, the customer
booking journey, cancellation and rescheduling, packages, trainer session timer (including a reload
and a device clock two hours fast), coach panel and drag persistence, and responsive layout checks.
Each test runs on a desktop and a mobile project; specs scoped to one viewport are skipped on the
other, which is why a full run reports 18 passed and 18 skipped.

**Smoke scripts.** `scripts/smoke.sh` is read-only: it signs in as each seeded role and checks that
workspace pages return 200 for their own role and not for the others, and that the cron endpoint
rejects a bad bearer token. `scripts/live-smoke.mjs` writes one scheduled booking and cancels it, so
it is for demo databases only.

## Business rules and the evidence for them

| Rule                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Double-booking protection**  | `integration/concurrency.test.ts` (parallel requests for one slot, mixed instant/scheduled, idempotent retries), `reschedule.test.ts` (two concurrent moves into one slot; a move racing a new booking), `cancellation.test.ts` (simultaneous cancels: one wins). DB exclusion constraints remain as a backstop. All passed.                                                                                                                                                      |
| **Price manipulation**         | The booking input schema has no price field; `PRICE_CHANGED` is asserted in `booking.test.ts` and `reschedule.test.ts`; `pricing.test.ts` asserts 399 → 39.90 → 438.90 and the 499 case. The live review screen showed ₹399.00 + ₹39.90 = ₹438.90.                                                                                                                                                                                                                                |
| **Package idempotency**        | `packages-payments.test.ts` and `reschedule.test.ts` (a package booking is never debited twice; a refund happens once); the unique `(bookingId, reason)` ledger constraint. A live check of the demo database showed `usedSessions` equal to the ledger sum after book-and-cancel cycles.                                                                                                                                                                                         |
| **Session timer persistence**  | `integration/session-lifecycle.test.ts` and `session-lifecycle.test.ts`: server-written start/end, repeated start returns the same deadline, warning and completion fire once, late reconciliation records `completedAt = endsAt`. Browser: `e2e/session-timer.spec.ts` starts a session, reloads and sees the same countdown, and loads the page under a two-hour-fast clock without a shift; the customer page shows "In progress". Waiting out a real 60 minutes was not done. |
| **Coach scope and safety**     | `coach.test.ts` (classification, fixed refusal and safety replies, context, fallback) and `integration/coach.test.ts` (a medical question is held back with no model call; an emergency is answered by the guard; out-of-scope questions are declined; every model failing still produces a grounded reply; limits and thread ownership hold). All passed.                                                                                                                        |
| **Coach in the browser**       | `e2e/coach.spec.ts`: the panel opens from any customer screen, a question is answered and labelled "Curated answer" without an AI key, the thread survives a reload, medical and emergency questions get the fixed replies, and the launcher can be dragged, stays on screen and remembers its position.                                                                                                                                                                          |
| **Sign-up and account**        | `integration/account.test.ts` covers customer/trainer sign-up (one user plus its role profile, duplicate email, weak password, unknown community, trainer categories), rejection of an `OPERATIONS` role, Google sign-up completion, and profile/password updates with role checks. `e2e/auth.spec.ts` covers sign-in, wrong password, workspace isolation and sign-out.                                                                                                          |
| **List pagination**            | `pagination.test.ts` (19 unit tests) and `integration/pagination.test.ts` (exact totals and tab counts, stale-page clamping, in-progress pinning, per-user isolation, package pages, pricing history).                                                                                                                                                                                                                                                                            |
| **Operations trainer detail**  | `integration/operations-trainer-detail.test.ts` (added 2026-10-23): profile fields and zone, lifetime counts, upcoming list, history ordering, trainer notes and customer feedback, and `null` for an unknown trainer. The sheet was also opened in a real browser against the demo database.                                                                                                                                                                                     |
| **Customer/trainer isolation** | `integration/auth.test.ts`, `cancellation.test.ts` ("does not let a customer cancel or discover someone else's booking"), `reschedule.test.ts`; `e2e/auth.spec.ts` (a customer cannot enter another workspace); `smoke.sh` cross-role requests on the deployment.                                                                                                                                                                                                                 |

## Live deployment verification

Verified on 2026-10-21 and 2026-10-22:

- Public pages `/`, `/how-it-works`, `/sign-in` return 200. Anonymous `/customer`, `/trainer`,
  `/operations` redirect (307) to sign-in.
- Seeded customer, trainer and operations accounts sign in; every workspace page listed in
  `smoke.sh` returns 200 for its own role.
- `/api/cron/session-lifecycle` with a wrong bearer returns 401 (the endpoint is configured; no
  scheduler calls it).
- Browser smoke: a scheduled Strength booking shows ₹399.00 + ₹39.90 = ₹438.90 on the review screen,
  appears in history, the packages page shows the "Demo checkout — no real money is charged" label,
  the fitness page loads, operations pricing shows 399/499, the trainer sessions page loads, and the
  smoke booking is cancelled.
- Coach smoke on 2026-10-22: five questions routed as intended — a warm-up question answered by
  Groq in 1.6 s using the customer's own context, a package/balance question answered in 0.8 s, a
  medication question and a coding question declined, and a chest-pain question held by the safety
  guard in 4 ms before any model call.

**Deployment versus local state.** The last deployment checks were on 2026-10-21/22. On 2026-10-23
the alias returned `DEPLOYMENT_NOT_FOUND` (Vercel: "The deployment could not be found"), so the live
demonstration is currently down. Work completed after the last deploy — removing the
workout-recommendation tab, self-service sign-up and account settings, and the operations trainer
profile sheet — is verified by the local suites and manual checks, but nothing is live until
`vercel deploy --prod` is run. Re-run `smoke.sh` and the walkthrough after deploying.

### Deployment defects found and fixed

1. Environment values pushed from a CRLF/single-quoted local `.env` were malformed
   (`DATABASE_URL must start with postgresql://`). Fixed by re-adding them cleanly.
2. Every database call failed on Vercel with `ENOENT … query_compiler_bg.wasm`. Fixed with
   `outputFileTracingIncludes` in `next.config.ts`.
3. The first alias probed (`zuryo.vercel.app`) belongs to someone else's project; the real alias is
   `zuryo-one.vercel.app`.

## Earlier runs (kept as a record)

- **2026-10-21.** Initial full suites: typecheck/lint clean, unit tests green, integration 95/100
  with five harness connection failures (all re-passed alone), E2E 18/18 after two test-defect fixes,
  deployed smoke 27/27. A live AI call returned HTTP 429 on the free tier and the labelled fallback
  ran instead.
- **2026-10-22.** Live updates, buzzer and customer live status (unit 201, affected integration 15);
  coach and Groq/OpenRouter provider chain (unit 231, coach integration 9); list pagination (unit
  250, affected integration 35, E2E 8/8); UI polish (unit 270, E2E 18/18); interaction batch (unit
  276, E2E 18/18). Live recommendation and coach smokes both succeeded via Groq that day.
- **2026-10-23.** The workout-recommendation feature was removed at the user's request, taking its
  unit, integration and E2E specs with it. The coach remains the only AI feature. A trainer-detail
  integration test and the operations profile sheet were added; the unit suite is now 31 files /
  275 tests.

Historical runs that mention recommendations, the Workouts tab, `ai:smoke`, or an Anthropic
provider describe code that is no longer in the repository.

## Not run, and limits on these claims

- No real 60-minute wait; the lifecycle is tested with injected time and reconciled states.
- No live call on the OpenRouter leg of the coach chain (Groq answered every smoke question).
- No load, soak or penetration testing; accessibility is checked through roles and labels in
  Playwright, not a full audit.
- Pricing edits and a real package purchase were not performed on the production database, to keep
  the demo data stable; both are covered by integration and E2E tests on the test database.
- Mobile layout is checked in Playwright viewports, not on physical devices.
- No scheduler runs automatically in production (see TECHNICAL_DECISIONS §10).
- The live URL was not re-verified after 2026-10-22; it returned `DEPLOYMENT_NOT_FOUND` on 2026-10-23.
