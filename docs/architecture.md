# Architecture (Phase 1)

## Shape of the system

One Next.js application, deployed to Vercel, backed by one Neon Postgres database.

```
Browser ──▶ Next.js on Vercel
              ├─ Server Components ── src/server/queries ──▶ Prisma client ──▶ Neon Postgres
              ├─ Route handlers / Server Actions (Phase 2+) ── src/server/services
              └─ Client Components (UI state only; no DB, no secrets)
```

A modular monolith fits an 8–12 hour assessment. Booking, assignment and pricing all need transactional consistency in one database, and separate services would add network failure modes without any benefit at this scale. Feature boundaries live in folders (`features/`, `server/`), not in deployments.

## Key decisions and trade-offs

| Decision                                                          | Why                                                                                                                                                                                                                                        | Trade-off                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 15.5, not 16**                                          | Mature, well-documented App Router line; the brief values reliability over novelty                                                                                                                                                         | Upgrading to 16 later means renaming `middleware.ts` to `proxy.ts` and running the official codemods                                               |
| **Prisma 6.19 with `engineType = "client"`**                      | The Rust-free client compiles queries in TS/WASM and talks to Postgres through `@prisma/adapter-pg`, so there's no native binary to bundle on Vercel. Prisma 6 is the stable line; npm's `latest` tag currently points at a v8 pre-release | Driver adapters are newer than the classic engine. If something misbehaves, remove `engineType` and the adapter to fall back to the classic engine |
| **`pg` adapter for both local and Neon**                          | One code path everywhere; Neon's pooled endpoint speaks the normal Postgres protocol                                                                                                                                                       | On edge runtimes you'd switch to `@prisma/adapter-neon` (HTTP/WebSocket); all routes here run on Node                                              |
| **Money as `Decimal(10,2)`, arithmetic in integer paise**         | Exact values; `calculatePriceBreakdown` never touches floats (10.05 × 10% = ₹1.01, not ₹1.00)                                                                                                                                              | Values cross the wire as strings and need explicit conversion                                                                                      |
| **Timestamps as `timestamptz`, displayed in the zone's timezone** | Instants are unambiguous; peak detection uses the community's local clock (IST)                                                                                                                                                            | Every display goes through `src/lib/utils/format.ts`                                                                                               |
| **Profiles keyed by `userId`**                                    | A user has at most one customer and one trainer profile, with no extra id to keep in sync                                                                                                                                                  | A user who is both customer and trainer would have both rows (allowed, intentionally)                                                              |
| **Constraints in SQL as well as code**                            | `CHECK` constraints (positive ranges, `total = price + commission`, package balance within bounds) and a partial unique index (one active pricing rule per kind) hold even if application code has a bug                                   | Hand-written SQL lives at the end of the init migration; future schema edits must keep it in mind                                                  |
| **Server-only boundaries**                                        | `src/lib/db`, `src/lib/config/env.server.ts` and `src/server/**` import `server-only`; ESLint blocks `new PrismaClient` outside `src/lib/db`                                                                                               | None in practice                                                                                                                                   |
| **No authentication yet; demo personas**                          | Phase 1 scope. Pages render fixed seeded users from `src/server/demo.ts` and say so in the UI                                                                                                                                              | Every route is public until Phase 2 adds sign-in and server-side role checks                                                                       |
| **Self-hosted fonts (Fontsource)**                                | No build-time call to Google Fonts; works offline and in CI                                                                                                                                                                                | Slightly larger repo dependency footprint                                                                                                          |

## Data model

```
User 1─0..1 CustomerProfile ─┬─< Booking >─┬─ 0..1 TrainerProfile (assigned)
     1─0..1 TrainerProfile   │             ├─ 0..1 TrainerProfile (preferred)
     1─< Notification        │             ├─ 1 ServiceZone
                             │             ├─ 1 PricingRule (the rule that priced it)
ServiceZone 1─< CustomerProfile            ├─ 0..1 Package
            1─< TrainerProfile             ├─< Payment
TrainerProfile 1─< TrainerAvailability     ├─ 0..1 SessionRecord
PricingRule 1─< PeakWindow                 └─< PackageLedgerEntry
CustomerProfile 1─< Package 1─< PackageLedgerEntry
```

| Model                            | Purpose and notable fields                                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                           | Identity and `role` (`CUSTOMER`, `TRAINER`, `OPERATIONS` enum) and `status`. Email unique. Designed to be linked to an auth provider's user id in Phase 2                                                                                                                                 |
| `ServiceZone`                    | A residential community, with seeded latitude/longitude standing in for GPS and an IANA `timezone`                                                                                                                                                                                        |
| `CustomerProfile`                | Assessment: age, weight, goals (enum array), level, preferences, and `assessedAt` (null means not assessed). No medical data                                                                                                                                                              |
| `TrainerProfile`                 | Specializations, experience, primary zone, `isActive`                                                                                                                                                                                                                                     |
| `TrainerAvailability`            | Time a trainer offers (`AVAILABLE`) or has blocked off (`BLOCKED`)                                                                                                                                                                                                                        |
| `PricingRule` + `PeakWindow`     | Price and commission % per kind (`NORMAL` / `PEAK`). Peak windows are recurring local-time ranges (ISO weekdays, minutes from midnight). Editing pricing creates a new rule and deactivates the old one                                                                                   |
| `Booking`                        | Who, when, where, mode, status, and an **immutable price snapshot** (`sessionPrice`, `commissionPercent`, `commissionAmount`, `totalAmount`, `isPeak`, `pricingRuleId`). `idempotencyKey` is unique so retried creates return the same booking. `reference` (ZY-XXXXX) is shown to people |
| `Package` + `PackageLedgerEntry` | `usedSessions` is a cached counter updated in the same transaction as a ledger row. `@@unique([bookingId, reason])` means a booking can be debited once and refunded once, however many times a request is retried                                                                        |
| `Payment`                        | Simulated only (`provider = SIMULATED`). `idempotencyKey` unique. No card data exists anywhere in the schema                                                                                                                                                                              |
| `SessionRecord`                  | `startedAt` / `endsAt` are written by the server when the trainer starts; clients derive the countdown from these. Also holds activities (JSON), trainer notes, suggested next workout and customer feedback                                                                              |
| `Notification`                   | In-app only. Indexed for "unread first, newest first" per recipient                                                                                                                                                                                                                       |

**Deletion behaviour.** Deleting a user cascades to their profiles and notifications. Financial and historical rows are protected: bookings, payments and session records use `Restrict`, so a customer with bookings can't be hard-deleted (deactivate with `status` instead). Removing a trainer sets `trainerId` to null on bookings rather than losing them.

**Simplifications to note in review:**

- "Rescheduled" is not a status. A rescheduled booking stays `CONFIRMED` with `rescheduleCount > 0` and `lastRescheduledAt`, so the state machine stays small and the UI can still show a "rescheduled" marker.
- A trainer has one primary zone. Many-to-many zone coverage would be a join table.
- **Package bookings vs paid bookings.** A booking linked to a package is prepaid (ledger debit, no `Payment` row). Other bookings carry a `Payment`. The price snapshot is recorded either way. Phase 2 confirms this rule in the checkout flow.
- **Double-booking.** The schema indexes `(trainerId, startAt)`. Phase 2 enforces no overlaps inside a serializable transaction, and can add a Postgres exclusion constraint (`btree_gist` on `trainerId` + `tstzrange(startAt, endAt)` for active statuses) as a database-level backstop.

## Peak pricing

A session is peak when its **start time**, in the community's local timezone, falls inside any `PeakWindow` of the active `PEAK` rule. Windows include their start and exclude their end, so a 9:00 start is not inside a 6:00–9:00 window. This is implemented in `src/lib/pricing/peak.ts` and unit-tested. Seeded windows are weekdays 06:00–09:00 and 17:00–20:00, plus weekends 07:00–11:00.

## Seed data

`prisma/seed-data.ts` builds the whole dataset as a pure function of the current IST date. Every record has a fixed `seed_*` id and `prisma/seed.ts` upserts inside one transaction, so re-running never duplicates anything. Re-running on a later day moves bookings so "upcoming" stays upcoming. The seed refuses to run with `NODE_ENV=production` unless `SEED_ALLOW_PRODUCTION=1` is set.

## Verification performed in Phase 1

- `prisma validate` passes.
- The init migration was applied to a fresh PostgreSQL 16 database, and the seed ran twice against it with identical row counts.
- The Rust-free client performed all reads and writes through `@prisma/adapter-pg`.
- `npm run typecheck`, `npm run lint`, `npm test` (48 tests) and `npm run build` pass.
- All 13 routes return 200 at desktop and mobile widths with no console errors or horizontal overflow; an unknown route returns 404. With the database unreachable, workspace pages render an explicit error state instead of crashing.
- **Not verified:** a live Neon connection (no credentials were available), and the Unsplash photos, which couldn't be fetched from the build environment. The designed image fallback rendered instead.

## Next: Phase 2, the booking engine

1. **Auth and roles.** Add sign-in (e.g. Auth.js with email magic links or seeded demo credentials), map sessions to `User.id`, replace `src/server/demo.ts`, and check the role in `middleware.ts` and in every server action or route handler.
2. **Availability API.** `GET /api/availability?zone&date` returns 60-minute slots, each with the server-computed price and peak flag (from availability minus active bookings).
3. **Quote.** `POST /api/quotes` returns the price breakdown from `calculatePriceBreakdown`, with a short-lived signed quote id.
4. **Create booking.** `POST /api/bookings` validates with `createBookingInputSchema`, then in one serializable transaction:
   - picks an eligible trainer (zone, availability, no overlap; preferred trainer first; tie-break by fewest bookings that day, then earliest free)
   - writes the price snapshot
   - debits the package ledger, or creates a simulated `Payment`
   - emits notifications
     The `idempotencyKey` makes retries safe.
5. **Cancel and reschedule** with state checks and a ledger refund (`CANCELLATION_REFUND`, unique per booking).
6. **UI.** Booking stepper (mode → time → trainer → review → simulated pay → confirmation) using the existing tokens and primitives.
7. **Tests.** Assignment tie-breaking, concurrent double-booking (two parallel transactions), idempotent retries and refund-once.

## Phase 4: fitness profiles & AI recommendations

**Profile.** `CustomerProfile` gains optional, voluntary preference detail (intensity, equipment, environment, avoid list, accommodations, movement limitations, goal notes). The selected goal list stays on `CustomerProfile.fitnessGoals` (read by matching and the trainer session page); `FitnessGoalTracking` rows add per-goal status/target/target-date and are kept in step with the selection by the profile form in one transaction.

**Recommendations.** `WorkoutRecommendation` stores the full structured workout as validated JSON (`payload`), denormalised listing columns, a goal/preference snapshot for historical explainability, the source (`AI`/`RULE_BASED`), the provider model id for AI rows, and customer feedback. `AiRequestLog` is the append-only attempt log the operations dashboard reads — no profile content is stored there.

**Generation flow.** The customer explicitly generates (never on page load), with a one-per-minute per-customer cooldown enforced from persisted timestamps. The service builds a bounded `RecommendationContext` (goal, level, equipment, preferences, up to 5 recent completed sessions, up to 3 feedback entries — nothing else), asks the provider abstraction (`lib/ai/provider.ts`, Anthropic Messages API with a forced structured-output tool), and validates the answer against `recommendationOutputSchema` before storing. Any provider failure (unconfigured, timeout, HTTP error, invalid output) falls back to deterministic rule-based templates in `lib/fitness/templates.ts`, which are honestly labelled `RULE_BASED` and never presented as AI.

**Booking integration.** A recommendation's "book this" link carries the workout category as a validated query param into the existing booking wizard, which pre-selects it. Booking, matching, pricing and payment logic are untouched.

## Authentication (NextAuth)

Email + password sign-in with NextAuth v5 (Auth.js): a Credentials provider (`src/lib/auth/index.ts`) verifies against the `User` table (bcrypt hash in `User.passwordHash`, seeded as `password123` for every demo account), refuses suspended users and workspace/role mismatches, and issues a signed JWT session cookie (30 days). The user id and role ride in the JWT (`src/lib/auth/types.d.ts` augments the session types).

- `src/middleware.ts` protects `/customer`, `/trainer` and `/operations` by role (the `authorized` callback in `src/lib/auth/auth.config.ts` does the checks, split from the Node-only provider so the edge middleware stays Prisma-free), bounces signed-in users away from `/sign-in`, and preserves `callbackUrl`.
- `src/server/auth/actor.ts` resolves every server action's and page's acting user from the session; it throws a structured `FORBIDDEN` error when there is no session or the role doesn't match, so direct action calls can't bypass the UI.
- Credential verification lives in `src/lib/auth/credentials.ts` with the database client injected, which is what lets the integration suite test it directly (12 tests in `tests/integration/auth.test.ts`).
- The demo persona cookie switcher is gone: switching demo users now means signing out and signing back in with another seeded email.

Known limitation: there is no email verification, password reset or sign-up yet — accounts come from the seed, and the demo database shares one password. Session identity itself is production-grade (signed, httpOnly, SameSite=Lax, CSRF-protected callback); the account provisioning around it is still demo-level.
