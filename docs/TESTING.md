# ZuryoFit — Testing and Evidence

All results below were produced on 2026-10-21 and 2026-10-22 on the author's Windows machine against
Neon PostgreSQL (us-east-2) and the Vercel deployment at https://zuryo-one.vercel.app. Nothing here is
simulated output; where something was not run it says so.

## Suites

| Suite                                                                   | Command                                                    | Needs                                                                        | Result                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type check                                                              | `npm run typecheck`                                        | —                                                                            | no errors                                                                                                                                                                   |
| Lint                                                                    | `npm run lint`                                             | —                                                                            | no errors                                                                                                                                                                   |
| Unit tests (pure rules, validation, seed, env, AI provider, pagination, CSV/ICS, UI helpers) | `npm test`                                                 | —                                                                            | **27 files, 276 tests passed** (~6 s)                                                                                                                                       |
| Production build                                                        | `npm run build`                                            | `DATABASE_URL` etc.                                                          | succeeded; 27 routes + middleware                                                                                                                                            |
| Database integration                                                    | `npm run test:integration`                                 | `TEST_DATABASE_URL`, `TEST_DIRECT_URL` (disposable DB; truncated every test) | **100 tests / 10 files in the last full run**; the 29 affected package/fitness tests re-passed on 2026-10-22 — see note                                                     |
| Browser E2E                                                             | `npm run test:e2e`                                         | Chromium, test DB; builds and serves the app on port 3100                    | **18 passed, 18 skipped** in the last full run (36 tests; skips are specs not applicable to the other viewport)                                                             |
| Deployed HTTP smoke                                                     | `bash scripts/smoke.sh https://zuryo-one.vercel.app`       | —                                                                            | **27 checks passed, 0 failed**                                                                                                                                              |
| Deployed browser smoke                                                  | `node scripts/live-smoke.mjs https://zuryo-one.vercel.app` | Chromium; writes then cancels one demo booking                               | **8 steps passed**                                                                                                                                                          |
| Live AI call                                                            | `npm run ai:smoke`                                         | `GROQ_API_KEY` (or `OPENROUTER_API_KEY`)                                     | 2026-10-21: **failed, HTTP 429** (free tier); 2026-10-22: **passed** via Groq — 2,266 ms, 1,131 in / 765 out                                                                |

**Integration run note.** The first full run finished 95 passed / 5 failed. All five failures were in
`cancellation.test.ts` and were the harness losing its Neon connection (`Hook timed out in 120000ms`,
`Server has closed the connection`), not assertion failures. The file was re-run alone and all 8 tests
passed. So every test passed at least once, but not in a single uninterrupted run; the suite takes ~25
minutes from this machine because of per-query latency.

**E2E notes.** Two test defects were fixed during this phase (not app defects): the cancel journey
clicked only the dialog trigger, not the dialog's confirm button; the sign-out test clicked before
React hydration. After the fixes the full suite passed (15/15 run).

**2026-10-22 additions (live updates, buzzer, customer live status).** Unit tests: **18 files, 201
tests passed**, including `buzzerCue()` in `tests/session-lifecycle.test.ts`. Integration, run for
the affected files only: `tests/integration/live.test.ts` + `session-lifecycle.test.ts`, **15 passed**
(~7 minutes). In the running app, `GET /api/live` returned 401 signed out and a fingerprint when signed
in, and an open customer page polled it every 20 s (one 503 on the first request after a cold start,
then all 200). **Not run:** the full integration suite, the Playwright suite (its `npm run build`
would overwrite the `.next` folder of a running `next dev`), and the buzzer's actual sound, which
needs a real device.

**2026-10-22 additions (fitness coach + Groq/OpenRouter providers).** Unit tests: **20 files, 231
tests passed**, including 14 coach tests (`tests/coach.test.ts`: scope classification, the safety
guard's fixed replies, context building, token usage, provider selection, the rule-based fallback)
and the provider chain plus explicit `AI_PROVIDER` selection in `tests/ai-provider.test.ts`. Integration, `tests/integration/coach.test.ts` only: **9
passed** (135 s) against the disposable Neon test database — the answer uses the customer's own
context, earlier messages are sent as history, medical questions and emergencies are held back
without a model call, every model failing still produces a grounded rule-based answer with the
failure kind recorded, the per-minute limit is enforced before any provider call, invalid input and
non-customers store nothing, clearing touches only the asking customer's thread, and coach usage
stays separate from recommendation usage. `npm run build` succeeded with the coach served as a
floating panel on every customer screen.

**Live provider runs on 2026-10-22** (real `GROQ_API_KEY`, free tier, `npm run coach:smoke` and
`npm run ai:smoke`):

- `ai:smoke` — served by `groq:openai/gpt-oss-120b` in 2,266 ms, 1,131 in / 765 out tokens,
  producing a valid structured plan ("Morning Lower-Body Strength + Conditioning", STRENGTH,
  45 min, MODERATE, 7 exercises). The chain it selected was
  `groq:openai/gpt-oss-120b,qwen/qwen3.8-27b > openrouter:minimax/minimax-m3.1-flash:free,google/gemma-4-31b-it:free`.
- `coach:smoke` — five questions, all routed as intended: a warm-up question answered by
  `groq:openai/gpt-oss-120b` in 1,609 ms using the customer's own context (including the shoulder
  limitation); a package question answered in 816 ms with the correct remaining count; a medication
  question held back with the fixed medical reply and no answer-model call; a code question refused
  as out of scope; a chest-pain question answered by the safety guard in 4 ms before any model was
  called.

**2026-10-22 additions (list pagination).** Typecheck and lint pass. Unit tests: **21 files, 250
tests passed**, including 19 new tests in `tests/pagination.test.ts` (page parsing, clamping,
out-of-range re-fetch, preserved filter params, page-window gaps) alongside the coach/provider suites.
Integration, run for the affected files only (`packages-payments.test.ts`, `fitness.test.ts` and
`pagination.test.ts`): **35 passed** (~9.5 minutes) against the disposable Neon test database. The new
`integration/pagination.test.ts` verifies exact totals and tab counts, the real last page on a stale
page number, in-progress pinning, per-recipient notification isolation, per-customer package pages,
and that active pricing rules stay visible while history pages. The full integration suite was
attempted but exceeded a 10-minute command window with no output; that is machine/Neon latency, not
an assertion failure. Browser E2E (`journeys.spec.ts`, `coach.spec.ts`): **8 passed, 8 skipped**
(mobile project) in 4.7 minutes, confirming the retabbed bookings/sessions pages and the test clients
still pass their journeys.

**2026-10-22 additions (UI/UX polish).** Typecheck and lint pass. Unit tests: **25 files, 270
tests passed**, including new suites for activity streaks (`tests/activity.test.ts`), sparkline/trend
maths (`tests/trend.test.ts`), calendar export (`tests/booking-ics.test.ts`) and operations filter
parsing (`tests/operations-filters.test.ts`). `npm run build` succeeded (26 routes + middleware) and
the full Playwright suite passed: **18 passed, 18 skipped** (36 tests across desktop and mobile; the
skips are specs intentionally scoped to one viewport). UI changes: per-route loading skeletons, a
customer momentum card with next-session countdown, a 12-week activity chart and streak, an
`.ics` calendar export plus copyable booking reference, 14-day operations trend charts,
URL-synced search/filter/sort on operations bookings and trainers, grouped notifications with
optimistic mark-all and a success toast, count-up figures, and a persisted light/dark theme with a
no-flash first paint.

**2026-10-22 additions (interaction batch).** Typecheck and lint pass. Unit tests: **27 files, 276
tests passed**, including CSV quoting (`tests/csv.test.ts`) and the three-state theme resolver
(`tests/theme.test.ts`). `npm run build` succeeded with a new operations CSV route (27 routes +
middleware). The full Playwright suite passed: **18 passed, 18 skipped** (36 tests across desktop and
mobile; skips are the specs scoped to the other viewport). The first full run had four timeouts, all
at the sign-in click: a lazily painted decorative image could sit over the submit button. The test
helper now submits from the password field with Enter, and the uninterrupted rerun was green. UI
changes: booking-draft restore with a start-over banner, always-visible wizard progress and a
scrolling date strip; an operations detail sheet with reassignment (re-checked availability) and a
required cancellation reason; operations saved filter views and CSV export; customer/trainer
onboarding checklists; a Cmd/Ctrl+K command palette; spot illustrations; a staged success reveal; and
peak/instant/simulated-payment tooltips. Onboarding and saved views are browser-local preferences,
not database state.

**Not run on 2026-10-22:** the full integration suite (it exceeds a single command window from this
machine — the affected files were run instead) and a live call on the OpenRouter leg of the chain
(the Groq leg answered every request, so the failover to OpenRouter was exercised only in unit
tests).

## Business rules and where they are covered

| Rule                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Double-booking protection**  | `tests/integration/concurrency.test.ts` (parallel requests for one slot; mixed instant/scheduled; idempotent retries), `reschedule.test.ts` (two concurrent moves into one slot; move racing a new booking), `cancellation.test.ts` (simultaneous cancels: one wins). DB exclusion constraints exist as a backstop. All passed.                                                                                                                                                                                                                                                                    |
| **Price manipulation**         | Booking input schema has no price field; `PRICE_CHANGED` asserted in `booking.test.ts` and `reschedule.test.ts`; `pricing.test.ts` asserts 399 → 39.90 → 438.90 and the 499 case. Live review screen showed 399.00 + 39.90 = 438.90.                                                                                                                                                                                                                                                                                                                                                               |
| **Package idempotency**        | `packages-payments.test.ts` and `reschedule.test.ts` (a package booking is never debited twice; refund once); unique `(bookingId, reason)` ledger constraint. Live: three package book-and-cancel cycles on the demo database (two leftover smoke bookings were cancelled by hand) left `seed_pkg_priya` at used 4 / 10 with a ledger sum of 4, i.e. `usedSessions` equals the ledger.                                                                                                                                                                                                             |
| **Session timer persistence**  | `tests/integration/session-lifecycle.test.ts` and `tests/session-lifecycle.test.ts`: server-written start/end, repeated start returns the same deadline, warning and completion fire once, late reconciliation records `completedAt = endsAt`. Time is injected, so 55/60-minute behaviour was tested without waiting. Browser check: `e2e/session-timer.spec.ts` starts a session as the trainer, sees the countdown, reloads (not reset), and loads the page under a device clock two hours fast (unchanged); the customer page shows "In progress". **Not run:** waiting out a real 60 minutes. |
| **AI fallback**                | `tests/ai-provider.test.ts`, `tests/fitness-recommendation.test.ts`, integration `fitness.test.ts`, E2E `fitness.spec.ts` (rule-based plan is labelled and bookable; one-per-minute cooldown). The live 429 on 2026-10-21 is itself an instance of the provider-failure path, though that run was the standalone smoke script, not the app.                                                                                                                                                                                                                                                        |
| **Coach scope and safety**     | `tests/coach.test.ts` (classification, fixed refusal and safety replies, context, fallback) and `tests/integration/coach.test.ts` (medical question held back with no model call; emergency answered by the safety guard before any model is called; out-of-scope questions declined; every model failing still answers from the grounded rules). All passed.                                                                                                                                                                                                                                      |
| **Coach in the browser**       | `e2e/coach.spec.ts` (3 tests): the floating panel opens from any customer screen, a question is answered and labelled "Curated answer" without any AI key, the thread survives a reload, a medical question is held back with the fixed refusal, a chest-pain question gets the safety reply with 112, and the launcher can be dragged, stays on screen and remembers its position after a reload.                                                                                                                                                                                                                                                                                                                      |
| **List pagination**            | `tests/pagination.test.ts` (19 unit tests) and `integration/pagination.test.ts` (6 tests: exact totals and tab counts, stale-page clamping, in-progress pinning, per-user isolation, package pages, active pricing survives history paging). Browser journeys still pass after the customer/trainer tabs were introduced.                                                                                                                                                                                                                                                                          |
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

- Live LLM output on 2026-10-21 (429 on the free tier); it worked again on 2026-10-22 through Groq, and the latency/token figures in ARCHITECTURE §J are from those runs.
- The Anthropic provider has never been called live.
- Pricing edits and production package purchase through the live UI were not exercised on the deployment (covered by integration/E2E on the test DB).
- Mobile-layout checks (`e2e/quality.spec.ts`) are part of the Playwright run; no real-device testing.
- No load or performance testing; no accessibility audit beyond role-based Playwright selectors.
- No scheduled job runs automatically in production.
