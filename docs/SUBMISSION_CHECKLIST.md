# Zuryo — Submission Checklist and Requirements Audit

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

| #   | Requirement                                                                   | Status | Evidence / note                                                                                                                          |
| --- | ----------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Instant booking (start within 60 min)                                         | V      | `tests/booking-rules.test.ts`, integration `booking.test.ts`                                                                             |
| A2  | Scheduled booking, future slot                                                | V      | E2E Journey A, live smoke                                                                                                                |
| A3  | Slots reflect persisted availability                                          | V      | `integration/availability.test.ts`                                                                                                       |
| A4  | Overlap prevention                                                            | V      | `integration/concurrency.test.ts`, DB exclusion constraints                                                                              |
| A5  | Auto-assign by availability + zone                                            | V      | `booking-matching.test.ts`, `booking.test.ts`                                                                                            |
| A6  | Preferred trainer                                                             | V      | `booking.test.ts` (eligible, ineligible → error with alternatives)                                                                       |
| A7  | Trainer notified of assignment/cancel/reschedule                              | V      | `cancellation.test.ts`, `reschedule.test.ts`, E2E A3 (in-app only)                                                                       |
| A8  | Customer/trainer views reflect changes                                        | V      | E2E journeys                                                                                                                             |
| A9  | No-trainer handled                                                            | V      | `booking.test.ts`, `reschedule.test.ts`; Ananya/Strength on live app                                                                     |
| A10 | Location via seeded zones                                                     | P      | Zone matching only; **no GPS, no live ETA**                                                                                              |
| B1  | ₹399 / ₹499 / 10% commission, ₹438.90 example                                 | V      | `pricing.test.ts`; live review screen shows ₹399.00 + ₹39.90 = ₹438.90                                                                   |
| B2  | Peak rules configurable                                                       | V      | `pricing-config.test.ts`, `/operations/pricing`                                                                                          |
| B3  | Server authoritative price                                                    | V      | no price field in input schema; `PRICE_CHANGED` tests                                                                                    |
| B4  | Simulated payment clearly labelled                                            | V      | packages page banner (live smoke)                                                                                                        |
| C1  | Server-persisted start, 60-minute end                                         | V      | `integration/session-lifecycle.test.ts`                                                                                                  |
| C2  | Visible trainer timer; refresh-safe; device-clock-safe                        | V      | `e2e/session-timer.spec.ts` (real browser: timer shows, survives reload, unchanged under a +2 h device clock; customer sees In progress) |
| C3  | 55-minute warning and 60-minute completion, idempotent                        | V      | integration + unit tests (deterministic time)                                                                                            |
| C4  | Automatic processing without a viewer                                         | P      | Cron route exists and is token-protected; **no scheduler attached**                                                                      |
| D1  | Purchased/used/remaining, history, cancellations                              | V      | `packages-payments.test.ts`, E2E Journey C                                                                                               |
| D2  | No duplicate deductions; defined restore rule                                 | V      | ledger unique constraint; integration tests; live book+cancel                                                                            |
| E1  | Fitness profile fields (age, weight, goals, level, preferences)               | V      | `integration/fitness.test.ts`, `schema.test.ts`                                                                                          |
| E2  | Session records (activities, duration, trainer notes, feedback, next workout) | V      | `integration/session-records.test.ts`                                                                                                    |
| F1  | AI recommendation from profile + history                                      | I      | Worked live 2026-10-20 (~9 s); 2026-10-21 run returned HTTP 429, fallback path verified                                                  |
| F2  | Provider failure → labelled fallback                                          | V      | `ai-provider.test.ts`, `fitness-recommendation.test.ts`, E2E fitness                                                                     |
| —   | Push notifications, GPS/ETA, real payments, sign-up                           | F      | TECHNICAL_DECISIONS.md                                                                                                                   |

## 5. Known limitations and unverified behaviour

- No scheduler is attached (see README). Cron endpoint verified to reject bad tokens only.
- The live LLM path was not re-verified on 2026-10-21 (rate limited); the Anthropic provider has never been called live.
- Free-tier hosting: cold starts and high per-query latency to Neon from some regions.
- Demo auth only; no rate limiting on sign-in.
- Operations pricing edits persist (integration-tested) but were not changed on the live database, to keep demo data stable.

## 6. Suggested future improvements

Attach a per-minute scheduler; push notifications via an outbox worker; GPS/ETA; real sign-up with
email verification; sign-in rate limiting; real payment provider; co-locate the DB region with the
function region; evaluate AI output quality.
