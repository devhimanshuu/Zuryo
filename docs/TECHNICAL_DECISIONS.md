# Zuryo — Technical Decisions, Cost and Future Work

Companion to [ARCHITECTURE.md](ARCHITECTURE.md). "Implemented" means it exists in this repository;
"proposed" means it does not.

## 1. Stack and why

| Choice                                                      | Why it fits this MVP                                                                                                                                              | Trade-off                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 15 App Router, one modular monolith**             | One deployable for UI, server actions and the cron route; server components read the database directly; no API versioning or CORS surface for a single web client | A future native app needs a real API layer (see §6)                                                                                                                                                                                    |
| **PostgreSQL (Neon) + Prisma 6**                            | Bookings and money need relational integrity, transactions, row locks and exclusion constraints, none of which a document store gives cheaply                     | Neon's serverless Postgres has cold starts and ~100s of ms latency from some regions                                                                                                                                                   |
| **Rust-free Prisma client + `@prisma/adapter-pg`**          | No native engine binary to bundle on Vercel                                                                                                                       | The WASM query compiler must be traced into the serverless bundle (`outputFileTracingIncludes` in `next.config.ts`; without it every query fails with `ENOENT … query_compiler_bg.wasm` — found and fixed during the first deployment) |
| **NextAuth v5 credentials + bcrypt, JWT cookie**            | Real sign-in and role checks with no third-party account needed for evaluators                                                                                    | Demo-grade: shared seeded password, no sign-up, no MFA, no reset flow                                                                                                                                                                  |
| **Zod 4 shared schemas, React Hook Form**                   | One validation definition on client and server                                                                                                                    | —                                                                                                                                                                                                                                      |
| **OpenRouter (free models) / Anthropic provider interface** | A provider abstraction with schema-validated output and a deterministic fallback keeps the feature working when the provider is down or rate limited              | Free models are congested (HTTP 429 observed 2026-10-21)                                                                                                                                                                               |

A monolith is right at this scale: one team, one database, no independently scaling workloads yet.
The seams (services in `src/server`, pure rules in `src/lib`) are where it would be split later.

## 2. Consistency, double-booking, timers, money

- **Double booking.** Row lock on the trainer (`SELECT … FOR UPDATE`) + re-validation inside the
  transaction, with `EXCLUDE USING gist` constraints for trainer and customer as a backstop
  (ARCHITECTURE §E). Verified by the integration suite (parallel requests for one slot).
- **Backend-authoritative timers.** `startedAt` and `endsAt = startedAt + 60 min` are written once by
  the server; the client only renders `endsAt − (now + serverOffset)`. Warning and completion are an
  idempotent reconciliation function over those timestamps, so late or duplicate runs are safe and
  record `completedAt = endsAt` (ARCHITECTURE §G). No in-memory timers exist anywhere.
- **Pricing.** The server re-quotes at confirmation; the booking input has no price field; the client
  total is only compared (`PRICE_CHANGED`). The snapshot is stored on the booking.
- **Package balances.** Append-only ledger (DB trigger), unique `(bookingId, reason)` so a debit or
  refund can happen once, `usedSessions` kept equal to the ledger, `0 ≤ used ≤ total` check.
- **Payments.** Simulated only, unique `idempotencyKey`, one successful payment per booking/package.

## 3. Notifications, GPS and live ETA — proposed designs

Not implemented: in-app notification rows only.

- **Push notifications.** Add `PushSubscription(userId, endpoint/token, platform)`; a worker drains
  `Notification` rows (outbox pattern: the row is already written in the event's transaction) and
  sends via Web Push / FCM / APNs, marking `deliveredAt`. Edge cases: expired tokens, quiet hours,
  duplicate delivery (use `dedupeKey`), user opt-out.
- **Production GPS and live ETA.** Native app posts trainer positions (`TrainerLocation(trainerId,
lat, lng, accuracy, recordedAt)`, throttled to ~every 10 s only while a session is within its
  travel window). ETA = routing API (Google Distance Matrix / OSRM) from last position to the zone
  coordinates (zones already carry seeded coordinates); push updates to the customer over SSE or
  WebSocket. Edge cases: permission denied, stale fixes, GPS spoofing, battery, privacy retention
  (delete positions after the session), zone-boundary matching by distance rather than zone equality.

## 4. Evolving to React Native

Move mutations from server actions to a versioned HTTP API (`/api/v1/...`) that calls the same
`src/server/**` services (they are already framework-agnostic and return `ServiceResult`). Reuse the
Zod schemas and `src/lib` rules in a shared package. Replace the cookie session with short-lived
access tokens + refresh tokens. Add push tokens (§3). The booking idempotency keys already make
mobile retry-on-flaky-network safe.

## 5. Production changes to auth, secrets and privacy (proposed)

Replace the shared demo password with per-user sign-up, password reset and email verification (or an
IdP such as OIDC/SSO); add rate limiting and lockout on sign-in; MFA for operations. Move secrets to
the host's secret store with per-environment values and rotation (already how Vercel env vars are
used; `AUTH_SECRET` and `CRON_SECRET` differ from local values). Encrypt or minimise health data
(weight, limitations): retention policy, export/delete on request, audit log for operations access,
and a separate database per environment. Real payments need a PCI-scoped provider (hosted checkout)
and webhook reconciliation.

## 6. Deliberately not implemented

Real payments; real push/SMS/email; GPS, live location and ETA; public sign-up and password reset;
trainer payouts; ratings; demand-based dynamic pricing beyond the configured peak windows; a
per-minute scheduler (see below); an admin UI for creating trainers/zones.

## 7. Proposed feature designs

### A. Preferred-trainer improvements (partly implemented: pick + strict validation)

- API: `setPreferredTrainer(customerId, trainerId)` and `GET /preferred-trainers` returning favourites
  with next free slots.
- Data: `CustomerPreferredTrainer(customerId, trainerId, rank, createdAt)`; the booking keeps its
  per-booking `preferredTrainerId`.
- Dependencies: matching already ranks and validates a requested trainer.
- Edge cases: preferred trainer unavailable (offer alternatives vs. auto-assign fallback as an
  explicit customer choice), trainer deactivated, preferred trainer outside the customer's zone.

### B. Demand-based pricing (proposed; only static peak windows exist)

- Data: `SurgeRule(zoneId, minUtilisation, multiplier, validFrom/To)` and a computed
  `utilisation = booked_minutes / available_minutes` per zone-slot; the quote stores the applied
  multiplier in the booking snapshot.
- API: the existing quote endpoints return `{base, surge, commission, total}`.
- Edge cases: price changing between quote and confirm (already handled by `PRICE_CHANGED`), caps and
  floors, fairness/transparency, rounding, packages (fixed price vs. surge-exempt), reschedules.

### C. Push notifications, reminders and offers (proposed)

- **UX:** reminders 24 h and 1 h before a session, "trainer assigned/changed" alerts, opt-in offers; a
  settings page with per-type toggles and quiet hours.
- **Data:** `PushSubscription(userId, platform, token, lastSeenAt)`, `NotificationPreference(userId, type, enabled)`,
  and `Notification.deliveredAt / channel` (the in-app row is already the outbox).
- **API:** `POST /api/v1/push/subscriptions`, `PATCH /api/v1/notification-preferences`; a worker drains undelivered rows.
- **Dependencies:** Web Push (VAPID) or FCM/APNs; a scheduler for reminders (see section 9).
- **Edge cases:** expired tokens, duplicates (reuse `dedupeKey`), reminders for cancelled/rescheduled bookings, offers need consent.

### D. Trainer/customer feedback and ratings (proposed; free-text customer feedback exists)

- **UX:** after completion the customer rates 1–5 and tags; the trainer can rate session conduct privately.
- **Data:** `SessionRating(bookingId unique, raterRole, stars, tags[], comment)`; trainer aggregates are computed, not stored by hand.
- **API:** `POST /api/v1/bookings/:id/rating` (completed bookings only, once per rater).
- **Dependencies:** matching can use average rating as a tie-break after the existing ranking.
- **Edge cases:** retaliatory or abusive ratings (moderation, hide until both submit), few-ratings bias (Bayesian average), deleted users.

### E. Workout recommendations on days without a trainer booking (proposed; recommendation engine exists)

- **UX:** a "Today" card suggesting a no-equipment routine when the customer has no session that day.
- **Data:** none new beyond `WorkoutRecommendation` with `kind = SELF_GUIDED`; the context builder already holds goals, equipment and recent sessions.
- **API:** reuse `generateRecommendationAction` with a `selfGuided` flag and a daily cache key.
- **Edge cases:** cost (cache one per customer per day), injuries/limitations (already passed to the prompt), repeating the last trainer plan.

### F. Nutrition recommendation chatbot (proposed)

- **UX:** a scoped chat (general nutrition, not medical advice) with a disclaimer and refusal of diagnosis.
- **Data:** `ChatThread`, `ChatMessage(role, content, tokens)`; store minimal profile context only.
- **API:** `POST /api/v1/chat` streaming responses with a per-customer rate limit.
- **Dependencies:** the existing provider abstraction; moderation/scope prompt; cost caps.
- **Edge cases:** medical or eating-disorder topics (escalate to a safe response), prompt injection, token cost growth over long threads (summarise).

### G. Progress tracking from historical assessments (partly implemented: per-goal tracking and session history exist)

- **UX:** weight/goal charts over time and a session streak.
- **Data:** `AssessmentSnapshot(customerId, takenAt, weightKg, level, goals[])`, written whenever the profile is saved, instead of overwriting history.
- **API:** `GET /api/v1/me/progress?from&to`.
- **Edge cases:** unit changes, sparse data, privacy (weight is sensitive; never sent to the LLM today).

## 8a. What I would build next, and why

1. **Attach a per-minute scheduler** — the only place the timer/warning design is not fully automatic today; it is small and removes the biggest honest caveat.
2. **Push notifications** (design C) — trainers must learn of assignments immediately; in-app rows are easy to miss.
3. **Real sign-up, password reset and sign-in rate limiting** — the demo password is the largest security gap before any real user.
4. **Live trainer location and ETA** — the headline differentiator for on-demand booking; it needs the native app first.
5. **AI quality evaluation** — today output is only schema-validated; measuring usefulness with trainer review would decide whether to pay for a better model.

## 8. Cost estimate

**Services actually used:** Vercel (hosting + serverless functions), Neon (PostgreSQL), OpenRouter
(free model routes). Optional: Anthropic API (not configured).

**Verified from vendor pricing pages on 2026-10-21** (prices change; re-check before relying on them):

| Item         | Verified figure                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby | $0/mo, personal/non-commercial use; 1M function invocations, 4 h Fluid Active CPU, 100 GB transfer per month; no extra usage purchasable |
| Vercel Pro   | $20/mo including $20 usage credit                                                                                                        |
| Neon Free    | $0; 100 CU-hours/project, 1 GB storage/project, scale-to-zero after 5 min                                                                |
| Neon Launch  | pay-as-you-go: $0.106 per CU-hour, $0.35 per GB-month                                                                                    |

Vercel's page did not state cron frequency limits. Vercel's documentation has said Hobby crons run at
most once per day (this repo's earlier notes record that, not re-verified today) — hence no
`vercel.json` cron is configured.

**Estimates (assumptions, not verified):**

- _Demo / early MVP (≤ ~100 bookings/month, evaluator traffic):_ **$0/month** on Vercel Hobby + Neon
  Free + OpenRouter free models. Caveat: Hobby is non-commercial; any commercial launch needs Pro.
- _Small paid launch:_ Vercel Pro $20 + Neon Launch. If the database is active ~6 h/day at 0.25 CU
  ≈ 45 CU-h ≈ $4.8 plus a few hundred MB of storage ≈ $0.1 → roughly **$25/month** before AI.
- _AI per interaction:_ observed ~1,460 input and ~1,000 output tokens per recommendation (measured
  2026-10-20). Cost = `1,460 × input_price + 1,000 × output_price`. For a hypothetical model priced at
  $1 / $5 per million tokens that is ≈ $0.0065 per interaction, so 1,000 recommendations ≈ $6.50.
  The $1/$5 figures are illustrative; take real prices from the provider's pricing page.
- _Scheduler:_ a per-minute external cron (e.g. a free cron service) is $0 to low; Vercel Pro cron is
  within the Pro base price (verify frequency limits).

Main cost drivers: Neon compute hours (always-on pool vs. scale-to-zero), AI tokens if a paid model
is used, and function CPU time.

## 9. Scheduler status

Verified: the cron route exists and refuses missing/incorrect tokens (HTTP 401 on the deployment).
**Not configured:** nothing calls it automatically. Until a scheduler is attached, 55-minute warnings
and 60-minute completion are produced by reconciliation on page loads, the trainer console's own
sync, and the operations "Reconcile" button, always with the correct persisted timestamps. To
attach one: call `GET https://<app>/api/cron/session-lifecycle` every minute with
`Authorization: Bearer $CRON_SECRET` from any scheduler (or Vercel Pro cron, after confirming the
frequency limit in current Vercel docs).
