# ZuryoFit — Technical Decisions, Cost and Future Work

Companion to [ARCHITECTURE.md](architecture.md). "Implemented" means the code is in this repository;
"proposed" means it is a design, not shipped behaviour.

## 1. Stack and why

| Choice                                              | Why it fits this MVP                                                                                                                                              | Trade-off                                                                                                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 15 App Router, one modular monolith**     | One deployable for UI, server actions and the cron route; server components read the database directly; no API versioning or CORS surface for a single web client | A future native app needs a real HTTP API layer (see §4)                                                                                                                                                              |
| **PostgreSQL (Neon) + Prisma 6**                    | Bookings and money need relational integrity, transactions, row locks and exclusion constraints, none of which a document store gives cheaply                     | Neon's serverless Postgres has cold starts and hundreds of milliseconds of latency from some regions                                                                                                                  |
| **Rust-free Prisma client + `@prisma/adapter-pg`**  | No native engine binary to bundle on Vercel                                                                                                                       | The WASM query compiler must be traced into the serverless bundle (`outputFileTracingIncludes` in `next.config.ts`; without it every query failed with `ENOENT … query_compiler_bg.wasm` during the first deployment) |
| **NextAuth v5: credentials + optional Google, JWT** | Real sign-in and role checks with no third-party account needed for evaluators; separate sign-up for customers and trainers                                       | Demo-grade edges remain: shared seeded password, no reset, verification, MFA or sign-in rate limiting                                                                                                                 |
| **Zod 4 shared schemas, React Hook Form**           | One validation definition on client and server                                                                                                                    | —                                                                                                                                                                                                                     |
| **Groq, then OpenRouter free models (LangChain)**   | The coach gets a fast free model first, then a free fallback chain, with curated answers when every model fails                                                   | Free models are rate limited and congested (HTTP 429 observed on 2026-10-21); live model ids change and only OpenRouter ids ending in `:free` are called                                                              |
| **Tailwind CSS 4 + Radix primitives**               | Consistent responsive UI without a component-library runtime                                                                                                      | Custom components, so more markup than a batteries-included kit                                                                                                                                                       |

A monolith is right at this scale: one team, one database and no independently scaling workloads yet.
The seams — services in `src/server`, pure rules in `src/lib` — are where it would be split later.

## 2. Consistency, double-booking, timers, money

- **Double booking.** A row lock on the trainer (`SELECT … FOR UPDATE`) plus re-validation inside the
  transaction, with `EXCLUDE USING gist` constraints for trainer and customer as a backstop
  (ARCHITECTURE §E). Verified by integration tests that fire parallel requests at one slot.
- **Backend-authoritative timers.** `startedAt` and `endsAt = startedAt + 60 min` are written once by
  the server; the client only renders `endsAt − (now + serverOffset)`. Warning and completion are an
  idempotent reconciliation over those timestamps, so late or duplicate runs are safe and record
  `completedAt = endsAt` (ARCHITECTURE §G). There are no in-memory timers.
- **Pricing.** The server re-quotes at confirmation; the booking input has no price field; the
  client's total is only compared (`PRICE_CHANGED`), and the agreed snapshot is stored on the booking.
- **Package balances.** An append-only ledger (DB trigger), unique `(bookingId, reason)` so a debit or
  refund happens once, `usedSessions` kept equal to the ledger, and `0 ≤ used ≤ total` checked.
- **Payments.** Simulated only, unique `idempotencyKey`, at most one successful payment per booking
  or package.
- **Sign-up.** One transaction creates the user and its role profile, so a half-created account cannot
  exist; the role is a closed schema that excludes operations.

## 3. Notifications, GPS and live ETA — proposed designs

Implemented today: in-app notification rows (written in the same transaction as the event),
simulated locations (seeded trainer bases and community coordinates), distance in matching and
instant reach, and a simulated arrival estimate for customers (ARCHITECTURE §D). What follows is the
production version.

- **Push notifications.** Add `PushSubscription(userId, endpoint/token, platform)`; a worker drains
  `Notification` rows (outbox pattern — the row already exists) and sends via Web Push / FCM / APNs,
  marking `deliveredAt`. Edge cases: expired tokens, quiet hours, duplicate delivery (use
  `dedupeKey`), user opt-out.
- **Production GPS and live ETA.** The native app posts trainer positions — `TrainerLocation(trainerId,
lat, lng, accuracy, recordedAt)` — throttled to roughly every 10 s only while a session is inside
  its travel window. ETA comes from a routing API (Google Distance Matrix or OSRM) between the last
  position and the community coordinates (zones already store coordinates), pushed to the customer
  over SSE or WebSocket. Edge cases: permission denied, stale fixes, GPS spoofing, battery use, and
  privacy retention (delete positions after the session). Matching would move from zone equality to
  distance bands.

## 4. Evolving to React Native

Move mutations from server actions to a versioned HTTP API (`/api/v1/...`) that calls the same
`src/server/**` services (they are framework-agnostic and already return typed `ServiceResult`s).
Reuse the Zod schemas and `src/lib` rules from a shared package. Replace the cookie session with
short-lived access tokens plus refresh tokens, and register push tokens (§3). The booking
idempotency keys already make retries on a flaky network safe. The screens map cleanly: customer home
and wizard, trainer session console (the countdown logic is also shareable), operations lists.

## 5. Production changes to auth, secrets and privacy

Self-service sign-up for customers and trainers is implemented, with optional Google OAuth. Before
real users, add email verification, password reset, sign-in rate limiting and lockout, and MFA for
operations (or move to an IdP such as OIDC/SSO). Move secrets to the host's secret store with
per-environment values and rotation (already how Vercel env vars are used; `AUTH_SECRET` and
`CRON_SECRET` differ from local values). Encrypt or minimise health data (weight, limitations):
retention policy, export/delete on request, an audit log for operations access, and a separate
database per environment. Real payments need a PCI-scoped provider (hosted checkout) and webhook
reconciliation.

## 6. Deliberately not implemented

Real payments; real push/SMS/email; GPS, live location and ETA; password reset, email verification,
MFA and sign-in rate limiting; trainer payouts; ratings; demand-based dynamic pricing beyond the
configured peak windows; a per-minute scheduler (see §10); an admin UI for creating trainers or
zones.

## 7. Proposed feature designs

The brief lists eight ideas. They map as follows: push notifications, reminders and offers (C); live
trainer location and arrival ETA (§3); preferred-trainer improvements (A); demand-based pricing (B);
trainer/customer feedback and ratings (D); workouts on days without a booking (E); a nutrition
chatbot (F, partly shipped as the scoped coach); and progress tracking from historical assessments
(G).

### A. Preferred-trainer improvements (partly implemented: per-booking pick + strict validation)

- **API:** `setPreferredTrainer(customerId, trainerId)` and `GET /preferred-trainers` returning
  favourites with their next free slots.
- **Data:** `CustomerPreferredTrainer(customerId, trainerId, rank, createdAt)`; the booking keeps its
  per-booking `preferredTrainerId`.
- **Dependencies:** matching already ranks and validates a requested trainer.
- **Edge cases:** preferred trainer unavailable (offer alternatives versus an explicit automatic
  fallback), trainer deactivated, preferred trainer outside the customer's zone.

### B. Demand-based pricing (proposed; only static peak windows exist)

- **Data:** `SurgeRule(zoneId, minUtilisation, multiplier, validFrom/To)` and a computed
  `utilisation = booked_minutes / available_minutes` per zone-slot; the quote stores the applied
  multiplier in the booking snapshot.
- **API:** the existing quote actions return `{base, surge, commission, total}`.
- **Edge cases:** price changing between quote and confirm (already handled by `PRICE_CHANGED`), caps
  and floors, fairness and transparency, rounding, packages (fixed price versus surge-exempt),
  reschedules.

### C. Push notifications, reminders and offers (proposed)

- **UX:** reminders 24 h and 1 h before a session, "trainer assigned/changed" alerts, opt-in offers;
  a settings page with per-type toggles and quiet hours.
- **Data:** `PushSubscription(userId, platform, token, lastSeenAt)`,
  `NotificationPreference(userId, type, enabled)`, and `Notification.deliveredAt / channel` (the
  in-app row is already the outbox).
- **API:** `POST /api/v1/push/subscriptions`, `PATCH /api/v1/notification-preferences`; a worker
  drains undelivered rows.
- **Dependencies:** Web Push (VAPID) or FCM/APNs, plus a scheduler for reminders (§10).
- **Edge cases:** expired tokens, duplicates (reuse `dedupeKey`), reminders for cancelled or
  rescheduled bookings, consent for offers.

### D. Trainer/customer feedback and ratings (proposed; free-text customer feedback exists)

- **UX:** after completion the customer rates 1–5 and adds tags; the trainer can rate conduct
  privately.
- **Data:** `SessionRating(bookingId unique, raterRole, stars, tags[], comment)`; trainer aggregates
  are computed, never stored by hand.
- **API:** `POST /api/v1/bookings/:id/rating` (completed bookings only, once per rater).
- **Dependencies:** matching can use an average rating as a tie-break after the existing ranking.
- **Edge cases:** retaliatory or abusive ratings (moderation, hide until both submit), few-ratings
  bias (Bayesian average), deleted users.

### E. Self-guided workouts on days without a trainer booking (proposed; the coach is the only AI today)

- **UX:** a "Today" card with a short no-equipment routine when the customer has no session that day,
  plus an "ask the coach about this" link.
- **Data:** `SelfGuidedPlan(id, customerId, forDate, payload, source, modelId, createdAt)` with a
  unique `(customerId, forDate)` key; the coach context already holds goals, equipment, preferences
  and recent sessions.
- **API:** `getTodayPlanAction` generates once per customer per day and caches the result; a card on
  `/customer`; the existing coach graph answers follow-ups.
- **Edge cases:** cost (one cached plan per customer per day), injuries and limitations (already in
  context), duplicating a trainer's suggested next workout, timezone boundaries for "today".

### F. Nutrition chatbot (implemented as the scoped fitness coach)

- **UX:** a floating coach panel on every customer screen (draggable launcher whose position is
  remembered, scope/safety copy, suggestion prompts, clear-history control) instead of a dedicated
  page. General nutrition is one allowed topic; medical and diet-for-condition questions are
  declined.
- **Data:** `ChatMessage(role, content, route, source, modelId, createdAt)`, one thread per customer;
  no separate thread table. The last 8 messages are prompt history and 40 are shown.
  `AiRequestLog.feature = COACH` keeps usage separate.
- **API:** server actions `loadCoachThreadAction` (first open), `askCoachAction`,
  `clearCoachHistoryAction`, `undoLastCoachTurnAction` (no streaming yet); 6 questions/minute and
  60/day per customer; messages are capped at 500 characters.
- **Dependencies:** LangChain (`@langchain/langgraph`, `@langchain/groq`, `@langchain/openai`) for the
  guard → classify → answer → fallback graph; Groq and OpenRouter free tiers; a keyword classifier
  and curated replies when no model answers.
- **Edge cases:** medical or eating-disorder topics (fixed refusal or safety reply), prompt injection
  (customer data is labelled as data, never instructions), token growth (bounded history), provider
  failure (next model, then curated answer).

### G. Progress tracking from historical assessments (partly implemented: goal tracking, charts and session history exist)

- **UX:** weight and goal charts over time, plus a session streak (the 12-week activity chart already
  exists).
- **Data:** `AssessmentSnapshot(customerId, takenAt, weightKg, level, goals[])`, written whenever the
  profile is saved, instead of overwriting history.
- **API:** `GET /api/v1/me/progress?from&to`.
- **Edge cases:** unit changes, sparse data, privacy (weight is sensitive and is never sent to the
  coach).

## 8. Cost estimate

**Services actually used:** Vercel (hosting and serverless functions), Neon (PostgreSQL), Groq and
OpenRouter (free model routes). Optional: a Google OAuth client (no charge).

**Verified from vendor pricing pages on 2026-10-21** (prices change; re-check before relying on them):

| Item         | Verified figure                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby | $0/mo, personal/non-commercial use; 1M function invocations, 4 h Fluid Active CPU, 100 GB transfer per month; no extra usage purchasable |
| Vercel Pro   | $20/mo including $20 usage credit                                                                                                        |
| Neon Free    | $0; 100 CU-hours/project, 1 GB storage/project, scale-to-zero after 5 min                                                                |
| Neon Launch  | pay-as-you-go: $0.106 per CU-hour, $0.35 per GB-month                                                                                    |

Vercel's page did not state cron frequency limits. Its documentation has said Hobby crons run at most
once per day (recorded in earlier notes, not re-verified today), which is why no `vercel.json` cron is
configured.

**Estimates (assumptions, not verified):**

- _Demo / early MVP (≤ ~100 bookings/month, evaluator traffic):_ **$0/month** on Vercel Hobby + Neon
  Free + free AI models. Caveat: Hobby is non-commercial; any commercial launch needs Pro.
- _Small paid launch:_ Vercel Pro $20 + Neon Launch. If the database is active ~6 h/day at 0.25 CU
  ≈ 45 CU-h ≈ $4.8 plus a few hundred MB of storage ≈ $0.1 → roughly **$25/month** before AI.
- _AI per interaction:_ coach usage is logged per call in `AiRequestLog`, and the current free models
  cost $0. On a paid model, cost = input tokens × input price + output tokens × output price. At an
  illustrative $1 / $5 per million and ~1,200 input / ~400 output tokens per answer that is ≈
  $0.0032 per answer, so 1,000 answers ≈ $3.20. The $1/$5 figures are illustrative; take real prices
  from the provider's pricing page.
- _Scheduler:_ a per-minute external cron is $0 to low; Vercel Pro cron is within the Pro base price
  (verify frequency limits).

Main cost drivers: Neon compute hours (always-on pool versus scale-to-zero), AI tokens if a paid
model is used, and function CPU time.

## 9. What I would build next, and why

1. **Attach a per-minute scheduler** — the only place the timer and warning design is not fully
   automatic today; it is small and removes the biggest honest caveat.
2. **Push notifications** (design C) — trainers must learn of assignments immediately; in-app rows
   are easy to miss.
3. **Email verification, password reset and sign-in rate limiting** — sign-up exists, but the shared
   demo password and unthrottled sign-in are the largest security gaps before real users.
4. **Live trainer location and ETA** — the headline differentiator for on-demand booking; it needs
   the native app first.
5. **Coach quality evaluation** — replies are only shape- and length-validated today; measuring
   usefulness with trainer review would decide whether to pay for a better model.

## 10. Scheduler status

Verified: the cron route exists and refuses missing or incorrect tokens (HTTP 401 on the deployment).
**Not configured:** nothing calls it automatically. Until a scheduler is attached, 55-minute warnings
and 60-minute completion are produced by reconciliation on page loads, a 20-second live poll, the
trainer console's own sync and the operations "Reconcile" button, always with the correct persisted
timestamps. To attach one, call `GET https://<app>/api/cron/session-lifecycle` every minute with
`Authorization: Bearer $CRON_SECRET` from any scheduler (or Vercel Pro cron, after confirming the
frequency limit in current Vercel docs).


