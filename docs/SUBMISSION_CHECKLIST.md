# ZuryoFit — Submission Checklist and Requirements Audit

## 1. Links

| Item              | Value                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Live application  | https://zuryo-one.vercel.app (verified 2026-10-21; see [TESTING.md](TESTING.md))                             |
| GitHub repository | https://github.com/devhimanshuu/Zuryo (remote verified with `git ls-remote`; see the final commit on `main`) |
| Hosting           | Vercel project `zuryo` (Hobby) + Neon PostgreSQL (`neondb`, us-east-2)                                       |

## 2. Demo access (all accounts synthetic; password `password123`)

| Role       | Sign in at `/sign-in`, choose workspace | Email                             |
| ---------- | --------------------------------------- | --------------------------------- |
| Customer   | Customer                                | `priya.sharma@demo.zuryo.example` |
| Trainer    | Trainer                                 | `arjun.mehta@demo.zuryo.example`  |
| Operations | Operations                              | `neha.kapoor@demo.zuryo.example`  |

Manual walkthrough: [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Setup and deployment: [../README.md](../README.md).

## 3. Documents

| Need                                                                                                  | File                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Architecture, data model (Mermaid), APIs, assignment, double booking, pricing, lifecycle, AI, scaling | [ARCHITECTURE.md](ARCHITECTURE.md)               |
| Decisions, cost estimate, proposed features, scheduler status                                         | [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md) |
| Test commands and real results                                                                        | [TESTING.md](TESTING.md)                         |
| Five-minute demo                                                                                      | [DEMO_SCRIPT.md](DEMO_SCRIPT.md)                 |
| Environment variables                                                                                 | [../.env.example](../.env.example)               |

## 4. Requirements audit

Legend: **V** verified working (automated test or live run) · **I** implemented, not fully verified ·
**P** partial · **F** proposed future work. Evidence names the test; counts are in TESTING.md.

| #   | Requirement                                                                      | Status | Evidence / note                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Instant booking (start within 60 min)                                            | V      | `tests/booking-rules.test.ts`, integration `booking.test.ts`                                                                                                                                                                                             |
| A2  | Scheduled booking, future slot                                                   | V      | E2E Journey A, live smoke                                                                                                                                                                                                                                |
| A3  | Slots reflect persisted availability                                             | V      | `integration/availability.test.ts`                                                                                                                                                                                                                       |
| A4  | Overlap prevention                                                               | V      | `integration/concurrency.test.ts`, DB exclusion constraints                                                                                                                                                                                              |
| A5  | Auto-assign by availability + zone                                               | V      | `booking-matching.test.ts`, `booking.test.ts`                                                                                                                                                                                                            |
| A6  | Preferred trainer                                                                | V      | `booking.test.ts` (eligible, ineligible → error with alternatives)                                                                                                                                                                                       |
| A7  | Trainer notified of assignment/cancel/reschedule                                 | V      | `cancellation.test.ts`, `reschedule.test.ts`, E2E A3 (in-app only)                                                                                                                                                                                       |
| A8  | Customer/trainer views reflect changes                                           | V      | E2E journeys; open pages also update without a reload (`GET /api/live` poll every 20 s, `integration/live.test.ts`)                                                                                                                                      |
| A9  | No-trainer handled                                                               | V      | `booking.test.ts`, `reschedule.test.ts`; Ananya/Strength on live app                                                                                                                                                                                     |
| A10 | Location: simulated GPS or seeded locations                                      | V      | Seeded community + trainer base coordinates; distance ranks trainers and limits instant reach; customers see a simulated ETA (`tests/location.test.ts`, `integration/location.test.ts`). Real device tracking / live ETA: proposed                       |
| B1  | ₹399 / ₹499 / 10% commission, ₹438.90 example                                    | V      | `pricing.test.ts`; live review screen shows ₹399.00 + ₹39.90 = ₹438.90                                                                                                                                                                                   |
| B2  | Peak rules configurable                                                          | V      | `pricing-config.test.ts`, `/operations/pricing`                                                                                                                                                                                                          |
| B3  | Server authoritative price                                                       | V      | no price field in input schema; `PRICE_CHANGED` tests                                                                                                                                                                                                    |
| B4  | Simulated payment clearly labelled                                               | V      | packages page banner (live smoke)                                                                                                                                                                                                                        |
| C1  | Server-persisted start, 60-minute end                                            | V      | `integration/session-lifecycle.test.ts`                                                                                                                                                                                                                  |
| C2  | Visible trainer timer; refresh-safe; device-clock-safe                           | V      | `e2e/session-timer.spec.ts` (real browser: timer shows, survives reload, unchanged under a +2 h device clock; customer sees In progress)                                                                                                                 |
| C2b | Buzzer at 55 and 60 minutes (sound + vibration)                                  | I      | `buzzerCue()` unit-tested in `tests/session-lifecycle.test.ts`; sound itself not testable headlessly                                                                                                                                                     |
| C2c | Customer sees a live countdown and phase while the session runs                  | I      | `live-session-status.tsx`; status transitions arrive through the live poll                                                                                                                                                                               |
| C3  | 55-minute warning and 60-minute completion, idempotent                           | V      | integration + unit tests (deterministic time)                                                                                                                                                                                                            |
| C4  | Automatic processing without a viewer                                            | P      | Any open page of the customer, trainer or operations records the warning/completion within ~20 s (`integration/live.test.ts`); with nobody online the cron route needs a scheduler, which is **not attached**                                            |
| D1  | Purchased/used/remaining, history, cancellations                                 | V      | `packages-payments.test.ts`, E2E Journey C                                                                                                                                                                                                               |
| D2  | No duplicate deductions; defined restore rule                                    | V      | ledger unique constraint; integration tests; live book+cancel                                                                                                                                                                                            |
| E1  | Fitness profile fields (age, weight, goals, level, preferences)                  | V      | `integration/fitness.test.ts`, `schema.test.ts`                                                                                                                                                                                                          |
| E2  | Session records (activities, duration, trainer notes, feedback, next workout)    | V      | `integration/session-records.test.ts`                                                                                                                                                                                                                    |
| F1  | AI recommendation from profile + history                                         | V      | Worked live 2026-10-20 (~9 s) and 2026-10-22 via Groq (2.3 s); the 2026-10-21 run returned HTTP 429 and the fallback path was verified instead                                                                                                           |
| F2  | Provider failure → labelled fallback                                             | V      | `ai-provider.test.ts`, `fitness-recommendation.test.ts`, E2E fitness                                                                                                                                                                                     |
| F3  | Free-tier providers (Groq, then OpenRouter) with failover and explicit selection | V      | `ai-provider.test.ts` (chain order, per-model failover, explicit `AI_PROVIDER`, honest error kinds) plus a live Groq run on 2026-10-22                                                                                                                   |
| F4  | Fitness-support coach within a defined scope                                     | V      | `coach.test.ts` (14 unit tests) and `integration/coach.test.ts` (9 tests: own context, history, scope refusals, safety replies, rate limits, stored thread, rule-based fallback); live `coach:smoke` on 2026-10-22 routed all five questions as intended |
| —   | Push notifications, GPS/ETA, real payments, sign-up                              | F      | TECHNICAL_DECISIONS.md                                                                                                                                                                                                                                   |

## 5. Known limitations and unverified behaviour

- No scheduler is attached (see README). Cron endpoint verified to reject bad tokens only.
- The live LLM path was rate limited on 2026-10-21 and worked again on 2026-10-22 via Groq; the Anthropic provider has never been called live.
- The coach's live path was verified through Groq on 2026-10-22; the OpenRouter leg of the failover chain has not served a live request.
- Free-tier hosting: cold starts and high per-query latency to Neon from some regions.
- Demo auth only; no rate limiting on sign-in.
- Operations pricing edits persist (integration-tested) but were not changed on the live database, to keep demo data stable.
- Lists use numbered `skip/take` pagination. Stable and exact at demo scale; keyset pagination is the next step if deep offsets become slow.

## 6. Suggested future improvements

Attach a per-minute scheduler; push notifications via an outbox worker; GPS/ETA; real sign-up with
email verification; sign-in rate limiting; real payment provider; co-locate the DB region with the
function region; evaluate AI output quality.
