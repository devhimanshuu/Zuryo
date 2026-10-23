# ZuryoFit

On-demand personal training for residential communities. Customers book a 60-minute session with a
trainer in their community, **instantly** (starting within the hour) or **scheduled** for later.
Trainers publish availability and run timed sessions; operations oversee bookings, trainers and
pricing. Payments and all data are **simulated/synthetic**.

**Live demo:** https://zuryo-one.vercel.app · **Repository:** https://github.com/devhimanshuu/Zuryo

## What it does

- **Customer:** fitness assessment (age, weight, goals, level, preferences) → booking wizard
  (instant/scheduled, workout type, slot, optional preferred trainer, price breakdown) → confirmation,
  cancel/reschedule → packages with simulated checkout → paged session history, feedback and
  a fitness progress dashboard → a scoped fitness-support coach that floats over every
  customer screen (drag it anywhere), answering training, recovery and general nutrition questions
  using the customer's own profile and session history.
- **Trainer:** schedule, availability windows, paged session history, session console with a
  server-backed 60-minute timer and 55-minute warning, session summary (activities, notes, suggested
  next workout).
- **Operations:** dashboard from persisted data, paged bookings and trainer roster, pricing/peak-window
  editor with paged version history, overdue-session reconciliation.

Pricing: standard ₹399, peak ₹499, plus a 10% society commission added at checkout
(₹399 → ₹438.90; ₹499 → ₹548.90). The server computes the payable amount.

## Feature status

**Implemented and verified** (unit + live-database integration tests, browser E2E, and live smoke
runs against the real Groq free tier; details in [docs/TESTING.md](docs/TESTING.md)):
instant/scheduled booking, availability,
automatic trainer assignment by seeded service zone, preferred trainer, double-booking protection,
no-trainer handling, server-side pricing and commission, simulated checkout, packages and ledger
(single deduction, restore on cancel), cancel and reschedule with notifications, session
start/timer/55-minute warning/60-minute completion (idempotent), fitness profile and session
records, role-based access, the scoped fitness
coach (graph, context loading, question limits, stored thread, rule-based fallback), and
URL-addressable server-side pagination with exact totals and tab counts on bookings, sessions,
notifications, packages, trainer rosters and pricing history.
Polished workspace UI: per-route loading skeletons, a next-session countdown and momentum card,
12-week activity charts and streaks, calendar export and copyable references, 14-day operations
trends, searchable/sortable operations lists, grouped notifications with optimistic mark-all, and a
persisted light/dark theme.

**Implemented but not fully verified:** automatic scheduled processing (the cron endpoint exists and is verified
to reject bad tokens, but no scheduler is attached); the OpenRouter leg of the provider chain (the
2026-10-22 live runs were served by Groq; the earlier 2026-10-21 run returned HTTP 429 on the free
tier and the labelled fallback is what ran).

**Partially implemented:** location (seeded service zones with synthetic coordinates, not GPS or
distance); notifications (in-app only).

**Proposed, not built:** push/SMS/email, live GPS and ETA, real payments, public sign-up, demand-based
pricing, React Native client. See [docs/TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 + Radix primitives ·
React Hook Form + Zod 4 · NextAuth v5 (credentials, JWT) · PostgreSQL on Neon · Prisma 6 (Rust-free
client + `@prisma/adapter-pg`) · Groq / OpenRouter (free models) for the coach · LangChain + LangGraph for the
coach · Vitest · Playwright · Vercel.

```
Browser ──▶ middleware (JWT + role) ──▶ Server Components / Server Actions ──▶ services ──▶ PostgreSQL
                                                                              └──▶ AI provider (fitness only)
Scheduler (optional) ──Bearer CRON_SECRET──▶ /api/cron/session-lifecycle
```

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Demo access

Open the live URL → **Sign in**, pick the workspace, use any seeded email with the demo password
`password123` (synthetic accounts on `*.example` addresses; the password is also printed on the
sign-in page):

| Workspace  | Email                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Customer   | `priya.sharma@demo.zuryo.example` (Palm Grove Residences; has a package, so booking offers "Confirm with package session") |
| Trainer    | `arjun.mehta@demo.zuryo.example`                                                                                           |
| Operations | `neha.kapoor@demo.zuryo.example`                                                                                           |

`ananya.iyer@demo.zuryo.example` lives in Lakeview Heights, which has no Strength trainer, so choosing
Strength there demonstrates the "no trainer in your community" behaviour.

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
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit`                                                                                  |
| `npm test`                           | Unit tests (no database)                                                                                 |
| `npm run test:integration`           | DB integration tests; needs `TEST_DATABASE_URL` (disposable DB — it is truncated)                        |
| `npm run test:e2e`                   | Playwright journeys against a production build and the test DB (`npx playwright install chromium` first) |
| `npm run build`                      | `prisma generate && next build`                                                                          |
| `npm run coach:smoke`                | One live coach question through the real provider chain (prints the route it took)                       |
| `bash scripts/smoke.sh <url>`        | HTTP smoke test (sign-in, pages, role isolation) against a deployment                                    |
| `node scripts/live-smoke.mjs <url>`  | Browser smoke: book, check price, cancel against a deployment (demo DB only)                             |

## Environment variables

Everything is documented in [.env.example](.env.example). Summary:

| Variable                                          | Scope  | Required           | Purpose                                                                 |
| ------------------------------------------------- | ------ | ------------------ | ----------------------------------------------------------------------- |
| `DATABASE_URL`                                    | server | yes                | Pooled Postgres URL (runtime)                                           |
| `DIRECT_URL`                                      | server | yes for migrations | Direct Postgres URL (Prisma Migrate)                                    |
| `AUTH_SECRET`                                     | server | yes                | Signs session JWTs; use a different value per environment               |
| `AI_PROVIDER`                                     | server | no                 | `auto` (default failover chain), `groq` or `openrouter`                 |
| `GROQ_API_KEY` / `GROQ_MODEL` / `GROQ_FAST_MODEL` | server | no                 | AI via Groq's free tier, tried first; unset → the next provider         |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`         | server | no                 | AI via OpenRouter's free tier, tried next; unset → rule-based fallback  |
| `CRON_SECRET`                                     | server | no                 | Bearer token for `/api/cron/session-lifecycle` (≥16 chars; unset → 503) |
| `NEXT_PUBLIC_APP_URL`                             | public | no                 | Canonical URL                                                           |
| `TEST_DATABASE_URL`, `TEST_DIRECT_URL`            | server | tests only         | Disposable test database                                                |

Server variables are validated by `src/lib/config/env.server.ts` (imports `server-only`); a missing
or malformed value produces a named error in the server log. Never commit `.env`.

## Deployment (Vercel + Neon)

Deployed at https://zuryo-one.vercel.app (Vercel project `zuryo`). To reproduce:

```bash
vercel link --project zuryo
# add DATABASE_URL, DIRECT_URL, AUTH_SECRET, CRON_SECRET, NEXT_PUBLIC_APP_URL (and optionally
# GROQ_API_KEY or OPENROUTER_API_KEY) with `vercel env add <NAME> production`
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

- Demo authentication: a shared seeded password, no sign-up, no reset, no MFA.
- Payment is simulated (clearly labelled); no real card data is handled.
- Location is seeded service-zone matching. There is no GPS, live position or ETA.
- Notifications are in-app only.
- No scheduler is attached; sessions nobody views are completed (with the correct `completedAt`) on the
  next page load, trainer sync, operations "Reconcile" click, or cron call. Needs a per-minute caller
  for true automation.
- Free-tier AI models are rate limited, so the labelled rule-based fallback is common.
- Neon latency from some regions is high (hundreds of ms/query); pages are slower than they would be
  with the database co-located with the Vercel function region.
