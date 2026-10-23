# ZuryoFit

On-demand personal training for residential communities. Customers book a 60-minute session with a
trainer in their community, **instantly** (starting within the hour) or **scheduled** for later.
Trainers publish availability and run timed sessions; operations oversee bookings, trainers and
pricing. Payments and all data are **simulated/synthetic**.

**Live demo:** https://zuryo-fit.vercel.app — the alias answered `DEPLOYMENT_NOT_FOUND` when checked on
2026-10-23 (the last successful checks were on 21–22 October), so it needs a fresh deploy before
submission. Steps are in [Deployment](#deployment-vercel--neon). · **Repository:**
https://github.com/devhimanshuu/ZuryoFit

## What it does

- **Customer:** create an account or sign in with a demo account → fitness assessment (age, weight,
  goals, level, preferences) → booking wizard (instant/scheduled, workout type, slot, optional
  preferred trainer, price breakdown) → confirmation, cancel/reschedule → packages with simulated
  checkout → paged session history, feedback and a fitness progress dashboard → a scoped
  fitness-support coach that floats over every customer screen, answering training, recovery and
  everyday nutrition questions using the customer's own profile and session history.
- **Trainer:** schedule, availability windows, paged session history, a session console with a
  server-backed 60-minute timer, 55-minute warning and buzzer, and a session summary (activities,
  notes, suggested next workout).
- **Operations:** dashboard from persisted data, paged bookings with a detail sheet (reassign,
  cancel), a trainer roster whose profile sheet shows each trainer's details, availability and
  session history, and a pricing/peak-window editor with paged version history.

Pricing is configured in the database: standard ₹399, peak ₹499, plus a 10% society commission added
at checkout (₹399 → ₹438.90; ₹499 → ₹548.90). The server computes the payable amount; the client
cannot set it.

## Feature status

**Implemented and verified** (unit tests, live-database integration tests and browser E2E — see
[TESTING.md](docs/TESTING.md)):

instant and scheduled booking, availability, automatic trainer assignment by seeded service zone
with distance/travel-time ranking, preferred trainer, double-booking protection, no-trainer
handling, server-side pricing and commission, simulated checkout, packages and ledger (single
deduction, restore on cancel), cancel and reschedule with notifications, session start / timer /
55-minute warning / 60-minute completion (idempotent), fitness profile and session records,
role-based access, self-service sign-up for customers and trainers, account name/password settings,
the scoped fitness coach (guard → classify → answer graph, context
loading, question limits, stored thread, rule-based fallback), and URL-addressable server-side
pagination on every growing list.

**Implemented but not fully verified:** automatic scheduled processing (the cron endpoint exists and
is verified to reject bad tokens, but no scheduler is attached); the OpenRouter leg of the coach's
model chain (the 2026-10-22 live runs were served by Groq, so OpenRouter failover is unit-tested
only); Google sign-in (the sign-up completion is integration-tested, but no OAuth client was
configured for a live sign-in); the audible buzzer on a physical phone.

**Partially implemented:** location (seeded service zones and trainer base coordinates, not live
GPS; matching and ETA are simulated); notifications (in-app only).

**Proposed, not built:** push/SMS/email, live GPS and ETA, real payments, demand-based pricing,
trainer ratings, a React Native client. Designs and trade-offs are in
[TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 + Radix primitives ·
React Hook Form + Zod 4 · NextAuth v5 (credentials + optional Google, JWT) · PostgreSQL on Neon ·
Prisma 6 (Rust-free client + `@prisma/adapter-pg`) · Groq / OpenRouter free models via LangChain and
LangGraph for the coach · Vitest · Playwright · Vercel.

```
Browser ──▶ middleware (JWT + role) ──▶ Server Components / Server Actions ──▶ services ──▶ PostgreSQL
                                                                              └──▶ AI provider (coach only)
Scheduler (optional) ──Bearer CRON_SECRET──▶ /api/cron/session-lifecycle
```

Full design and data model: [ARCHITECTURE.md](docs/architecture.md).

## Demo access

Open the live URL → **Sign in**, pick the workspace, and use a seeded account with the password
`password123` (all accounts are synthetic, on `.example` addresses; the sign-in page lists them).

| Workspace  | Email                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Customer   | `priya.sharma@demo.zuryo.example` (Palm Grove Residences; has a package, so booking offers "Confirm with package session") |
| Trainer    | `arjun.mehta@demo.zuryo.example`                                                                                           |
| Operations | `neha.kapoor@demo.zuryo.example`                                                                                           |

`ananya.iyer@demo.zuryo.example` lives in Lakeview Heights, which has no Strength trainer, so
choosing Strength there demonstrates the "no trainer in your community" behaviour.

You can also create a customer or trainer account from `/sign-up` (Google sign-in appears when the
optional Google credentials are configured). Operator accounts are created by staff; there is no
self-service operator sign-up.

## Submission documents

The assignment's section 8 maps to these files.

| Submission item                                    | Where                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Live application URL                               | https://zuryo-fit.vercel.app (redeploy required — see the note at the top)                              |
| GitHub repository                                  | https://github.com/devhimanshuu/ZuryoFit                                                                  |
| Demo customer/trainer/ops access                   | Demo access above, and [SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md)                          |
| README: setup and deployment                       | This file                                                                                               |
| Technical architecture and database schema         | [ARCHITECTURE.md](docs/architecture.md) §A–C                                                            |
| Automated test instructions and results            | [TESTING.md](docs/TESTING.md)                                                                           |
| Screen recording / live walkthrough                | [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) (a narrated walkthrough; record it if a video is wanted)          |
| Implemented / partial / proposed features          | Feature status above and [SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md) §5                     |
| Cost estimate and scaling plan                     | [TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md) §8 and [ARCHITECTURE.md](docs/architecture.md) §K |
| What I would build next and why                    | [TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md) §9                                                |
| Requirements audit and technical-document coverage | [SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md)                                                 |

## Getting started

Prerequisites: Node.js 20.9+, npm, a PostgreSQL database (Neon free tier or local Postgres 15+).

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET (see the file for every variable)
npm run db:deploy           # apply migrations (non-destructive)
npm run db:seed             # deterministic synthetic demo data; idempotent upserts
npm run dev                 # http://localhost:3000
```

| Command                              | Purpose                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `npm run check`                      | typecheck + lint + unit tests                                                                            |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit`                                                                                  |
| `npm test`                           | Unit tests (no database)                                                                                 |
| `npm run test:integration`           | DB integration tests; needs `TEST_DATABASE_URL` (disposable DB — it is truncated)                        |
| `npm run test:e2e`                   | Playwright journeys against a production build and the test DB (`npx playwright install chromium` first) |
| `npm run build`                      | `prisma generate && next build`                                                                          |
| `npm run coach:smoke`                | One live coach question through the real provider chain (prints the route it took)                       |
| `bash scripts/smoke.sh <url>`        | HTTP smoke test (sign-in, pages, role isolation) against a deployment                                    |
| `node scripts/live-smoke.mjs <url>`  | Browser smoke: book, check price, cancel against a deployment (demo DB only)                             |

Current test results and the exact commands are in [TESTING.md](docs/TESTING.md).

## Environment variables

Everything is documented in [.env.example](.env.example). Summary:

| Variable                                          | Scope  | Required           | Purpose                                                                                                           |
| ------------------------------------------------- | ------ | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | server | yes                | Pooled Postgres URL (runtime)                                                                                     |
| `DIRECT_URL`                                      | server | yes for migrations | Direct Postgres URL (Prisma Migrate)                                                                              |
| `AUTH_SECRET`                                     | server | yes                | Signs session JWTs; use a different value per environment                                                         |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`           | server | no                 | Optional Google sign-in; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` also accepted. Unset → email + password only |
| `AI_PROVIDER`                                     | server | no                 | `auto` (default failover chain), `groq` or `openrouter`                                                           |
| `GROQ_API_KEY` / `GROQ_MODEL` / `GROQ_FAST_MODEL` | server | no                 | AI via Groq's free tier, tried first; unset → the next provider                                                   |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`         | server | no                 | AI via OpenRouter's free tier, tried next; unset → rule-based fallback                                            |
| `CRON_SECRET`                                     | server | no                 | Bearer token for `/api/cron/session-lifecycle` (≥16 chars; unset → 503)                                           |
| `NEXT_PUBLIC_APP_URL`                             | public | no                 | Canonical URL                                                                                                     |
| `TEST_DATABASE_URL`, `TEST_DIRECT_URL`            | server | tests only         | Disposable test database                                                                                          |

Server variables are validated by `src/lib/config/env.server.ts` (imports `server-only`); a missing
or malformed value produces a named error in the server log. Never commit `.env`.

## Deployment (Vercel + Neon)

The project is `zuryo` and the intended alias is https://zuryo-fit.vercel.app. As of 2026-10-23 that
alias returns `DEPLOYMENT_NOT_FOUND`, so the first step before submitting is to deploy again. The
steps, which also work from a fresh Vercel project:

```bash
vercel link --project zuryo
# add DATABASE_URL, DIRECT_URL, AUTH_SECRET, CRON_SECRET, NEXT_PUBLIC_APP_URL (and optionally
# GROQ_API_KEY, OPENROUTER_API_KEY or the Google OAuth pair) with `vercel env add <NAME> production`
DATABASE_URL=… DIRECT_URL=… npx prisma migrate deploy   # safe: applies pending migrations only
npm run db:seed                                          # demo database only
# A demo database seeded before trainer locations existed: set them without re-seeding
npx tsx prisma/backfill-trainer-locations.ts
vercel deploy --prod
bash scripts/smoke.sh https://<your-app>.vercel.app
```

`next.config.ts` contains `outputFileTracingIncludes` for the Prisma WASM files; removing it breaks
every database call on Vercel. Never run `db:reset` against a database you care about.

## Known limitations

- Demo authentication: seeded accounts share the published password. Self-service sign-up exists
  for customers and trainers, but there is no password reset, email verification, MFA or sign-in
  rate limiting, and operator accounts are created by staff.
- Payment is simulated (clearly labelled); no real card data is handled.
- Location is seeded service-zone matching with synthetic coordinates. There is no GPS, live
  position or routing API.
- Notifications are in-app only.
- No scheduler is attached; sessions nobody views are completed (with the correct `completedAt`) on
  the next page load, live poll, trainer sync, operations "Reconcile" click, or cron call. Needs a
  per-minute caller for true automation.
- Free-tier AI models are rate limited, so the labelled rule-based fallback is common.
- Neon latency from some regions is high (hundreds of ms/query); pages are slower than they would be
  with the database co-located with the Vercel function region.
