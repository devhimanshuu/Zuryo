# Zuryo

On-demand personal training for residential communities. Customers book a 60-minute session with a qualified trainer, either **instantly** (starting within the hour) or **scheduled** for later. Trainers manage availability and run sessions, and operations teams oversee bookings, assignments and pricing.

> **Status: Phase 1, foundation and product shell.** The data model, seed data, design system and all three role workspaces are in place and read real data from Postgres. Booking, checkout, authentication, the live session timer and AI recommendations are **not built yet**. Screens say so explicitly wherever a later phase fills them in.

## Stack

| Layer   | Choice                                                                 | Why                                                                                                               |
| ------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| App     | Next.js 15.5 (App Router), React 19, TypeScript (strict)               | One deployable unit for UI and API, with server components reading the DB directly and first-class Vercel support |
| UI      | Tailwind CSS 4, shadcn/ui conventions (Radix + cva), Lucide icons      | Design tokens as CSS variables; accessible primitives without a heavy component kit                               |
| Forms   | React Hook Form + Zod 4                                                | One schema validates on the client and again on the server                                                        |
| Data    | PostgreSQL on Neon, Prisma 6 (Rust-free client + `@prisma/adapter-pg`) | Relational integrity for bookings and money; no native engine binary to bundle on Vercel                          |
| Quality | ESLint 9, Prettier, Vitest                                             | Fast, conventional                                                                                                |

Read [docs/architecture.md](docs/architecture.md) for the reasoning, data model and trade-offs.

## Getting started

Prerequisites: Node.js 20.9+ and npm, plus a Postgres database (Neon free tier recommended, or a local Postgres 15+).

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill in DATABASE_URL and DIRECT_URL (see below)
npm run db:deploy           # apply migrations
npm run db:seed             # load the synthetic demo data (safe to re-run)
npm run dev                 # http://localhost:3000
```

### Getting a Neon connection string

1. Create a free project at <https://console.neon.tech>. Choose the region closest to your users (for India, AWS Singapore `ap-southeast-1`).
2. Create a database named `zuryo` (or use `neondb`).
3. Open **Dashboard → Connect** and pick **Prisma** as the connection type.
4. Copy the **pooled** string (host contains `-pooler`) into `DATABASE_URL`.
5. Copy the **direct** string (no `-pooler`) into `DIRECT_URL`. Prisma Migrate needs a direct connection; the app uses the pooled one at runtime.
6. Keep `?sslmode=require` on both.

For a local Postgres, set both variables to the same URL, e.g. `postgresql://postgres:postgres@localhost:5432/zuryo`.

## Environment variables

| Variable              | Scope           | Required         | Purpose                                                         |
| --------------------- | --------------- | ---------------- | --------------------------------------------------------------- |
| `DATABASE_URL`        | server only     | yes              | Pooled Postgres URL used by the app at runtime                  |
| `DIRECT_URL`          | server only     | for migrations   | Direct Postgres URL used by `prisma migrate`                    |
| `ANTHROPIC_API_KEY`   | server only     | no (later phase) | AI workout recommendations                                      |
| `NEXT_PUBLIC_APP_URL` | browser-visible | no               | Canonical URL for metadata; defaults to `http://localhost:3000` |

Server variables are validated with Zod in `src/lib/config/env.server.ts`, which imports `server-only`. Any attempt to import it from a client component fails the build. Only `NEXT_PUBLIC_*` values reach the browser. `.env` is git-ignored; never commit real credentials.

## Scripts

| Command                           | What it does                                    |
| --------------------------------- | ----------------------------------------------- |
| `npm run dev`                     | Start the dev server                            |
| `npm run build` / `npm start`     | Production build / serve                        |
| `npm run typecheck`               | `tsc --noEmit` (strict)                         |
| `npm run lint`                    | ESLint                                          |
| `npm run format` / `format:check` | Prettier                                        |
| `npm test`                        | Vitest unit tests                               |
| `npm run check`                   | typecheck + lint + tests                        |
| `npm run db:validate`             | Validate `prisma/schema.prisma`                 |
| `npm run db:migrate`              | Create and apply a new migration in development |
| `npm run db:deploy`               | Apply pending migrations (CI / production)      |
| `npm run db:seed`                 | Upsert the demo dataset (idempotent)            |
| `npm run db:reset`                | Drop, re-migrate and re-seed the dev database   |
| `npm run db:studio`               | Browse data in Prisma Studio                    |

## Demo access

There is **no authentication in Phase 1**. Visit `/sign-in` and pick a workspace. Each one renders a fictional seeded persona:

| Workspace  | URL           | Persona                                                  |
| ---------- | ------------- | -------------------------------------------------------- |
| Customer   | `/customer`   | Priya Sharma, Palm Grove Residences (10-session package) |
| Trainer    | `/trainer`    | Arjun Mehta, strength and mobility                       |
| Operations | `/operations` | Neha Kapoor                                              |

All people, emails (`*.example`), addresses and bookings are synthetic. Demo prices (₹399 normal, ₹499 peak, 10% society commission) are configuration, not market claims.

## Deploying to Vercel

1. Push the repository to GitHub and import it in Vercel. The framework preset is detected.
2. Add `DATABASE_URL`, `DIRECT_URL` and `NEXT_PUBLIC_APP_URL` in **Project → Settings → Environment Variables**.
3. Run migrations against Neon once, from your machine (`npm run db:deploy`), then seed it (`npm run db:seed`). Alternatively set the Vercel build command to `prisma migrate deploy && npm run build`.
4. Deploy. `postinstall` runs `prisma generate`, and the Rust-free client needs no extra binaries.

## Project layout

```
prisma/            schema, migrations, deterministic seed (seed-data.ts is pure and unit-tested)
src/app/           routes: (marketing) (auth) (customer) (trainer) (operations)
src/components/    ui/ primitives · layout/ shells & navigation · shared/ badges, states, images
src/features/      feature-specific UI (bookings, customers)
src/lib/           config/ env + images · db/ Prisma client (server-only) · pricing/ money maths
                   validation/ Zod schemas · utils/
src/server/        server-only data access (queries/) and demo personas
tests/             Vitest suites
docs/              architecture and decisions
```
