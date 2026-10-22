import { Dumbbell, Sparkles, Target, TrendingUp, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardIcon, CardTitle } from "@/components/ui/card";
import { FitnessProfileForm } from "@/features/fitness/profile-form";
import { GenerateRecommendationButton } from "@/features/fitness/generate-button";
import { RecommendationCard } from "@/features/fitness/recommendation-card";
import { categoryLabel } from "@/lib/booking/categories";
import { recommendationOutputSchema } from "@/lib/fitness/recommendation-schema";
import {
  EQUIPMENT_LABELS,
  ENVIRONMENT_LABELS,
  GOAL_LABELS,
  INTENSITY_LABELS,
  PREFERENCE_LABELS,
} from "@/lib/fitness/labels";
import { safely } from "@/lib/utils/errors";
import { formatDay, formatSlot, titleCase } from "@/lib/utils/format";
import { getDb } from "@/lib/db";
import type { FitnessGoal, WorkoutCategory } from "@/lib/validation/enums";
import { actualDurationMinutes, parseActivities, type SessionActivity } from "@/lib/validation/sessions";
import { getActor } from "@/server/auth/actor";
import { getFitnessDashboard } from "@/server/fitness/fitness-service";

export const metadata: Metadata = { title: "Fitness" };

function describe(a: SessionActivity) {
  const parts = [a.sets && a.reps ? `${a.sets} × ${a.reps}` : a.sets ? `${a.sets} sets` : null];
  if (a.durationMin) parts.push(`${a.durationMin} min`);
  if (a.durationSec) parts.push(`${a.durationSec}s`);
  return parts.filter(Boolean).join(" · ");
}

export default async function FitnessPage() {
  const actor = await getActor("CUSTOMER");
  const result = await safely(() => getFitnessDashboard(getDb(), actor.userId, new Date()));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { profile, goals, recommendations, stats, sessions } = result.data;

  const activeGoals = (profile?.fitnessGoals ?? []) as FitnessGoal[];
  const goalDetail = new Map(goals.map((g) => [g.goal, g]));
  const maxCategory = Math.max(1, ...stats.categories.map((c) => c.count));
  const cards = recommendations
    .map((r) => {
      const payload = recommendationOutputSchema.safeParse(r.payload);
      return payload.success
        ? {
            id: r.id,
            source: r.source,
            status: r.status,
            title: r.title,
            explanation: r.explanation,
            category: r.category,
            durationMinutes: r.durationMinutes,
            intensity: r.intensity,
            modelId: r.modelId,
            feedback: r.feedback,
            feedbackNote: r.feedbackNote,
            createdAt: r.createdAt.toISOString(),
            payload: payload.data,
          }
        : null;
    })
    .filter((c) => c !== null);

  return (
    <div>
      <PageHeader
        editorial
        title="Fitness"
        description={`Your profile, progress and workouts for ${actor.name}. Every number below comes from your saved records.`}
        className="pb-0"
      />

      <div className="mt-8 grid gap-8 xl:grid-cols-[340px_1fr]">
        {/* ── Profile ─────────────────────────────────────────────────── */}
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardIcon icon={UserRound} />
            </CardHeader>
            <CardContent className="grid gap-3">
              {profile ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-body-md">
                  <dt className="text-ink-muted">Age</dt>
                  <dd className="font-semibold">{profile.age ?? "Not set"}</dd>
                  <dt className="text-ink-muted">Weight</dt>
                  <dd className="font-semibold">{profile.weightKg ? `${profile.weightKg.toString()} kg` : "Not set"}</dd>
                  <dt className="text-ink-muted">Level</dt>
                  <dd className="font-semibold">{profile.fitnessLevel ? titleCase(profile.fitnessLevel) : "Not set"}</dd>
                  <dt className="text-ink-muted">Intensity</dt>
                  <dd className="font-semibold">
                    {profile.intensity ? INTENSITY_LABELS[profile.intensity] : "Not set"}
                  </dd>
                  <dt className="text-ink-muted">Where</dt>
                  <dd className="font-semibold">
                    {profile.environment ? ENVIRONMENT_LABELS[profile.environment] : "Not set"}
                  </dd>
                  <dt className="text-ink-muted">Equipment</dt>
                  <dd className="font-semibold">
                    {profile.equipment.length ? profile.equipment.map((e) => EQUIPMENT_LABELS[e]).join(", ") : "None listed"}
                  </dd>
                  <dt className="text-ink-muted">Prefers</dt>
                  <dd className="font-semibold">
                    {profile.workoutPreferences.length
                      ? profile.workoutPreferences.map((p) => PREFERENCE_LABELS[p]).join(", ")
                      : "None listed"}
                  </dd>
                </dl>
              ) : (
                <p className="text-ink-muted">No profile yet.</p>
              )}
              {profile?.movementLimitations ? (
                <p className="rounded-md bg-sunken px-3 py-2 text-body-sm">
                  <span className="font-semibold">Limitations you shared: </span>
                  {profile.movementLimitations}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Goals</CardTitle>
              <CardIcon icon={Target} />
            </CardHeader>
            <CardContent>
              {activeGoals.length === 0 ? (
                <p className="text-ink-muted">No goals selected yet. Edit your profile to add some.</p>
              ) : (
                <ul className="grid gap-2.5">
                  {activeGoals.map((g) => {
                    const detail = goalDetail.get(g);
                    return (
                      <li key={g} className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{GOAL_LABELS[g]}</p>
                          <span
                            className={
                              detail?.status === "COMPLETED"
                                ? "text-xs font-semibold text-success"
                                : "text-xs font-semibold text-brand"
                            }
                          >
                            {detail?.status === "COMPLETED" ? "Completed" : "Active"}
                          </span>
                        </div>
                        {detail?.target ? <p className="text-body-sm text-ink-muted">Target: {detail.target}</p> : null}
                        {detail?.targetDate ? (
                          <p className="text-body-sm text-ink-muted">By {formatDay(detail.targetDate)}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Progress</CardTitle>
                <p className="text-body-sm text-ink-muted">From your completed sessions.</p>
              </div>
              <CardIcon icon={TrendingUp} />
            </CardHeader>
            <CardContent className="grid gap-3">
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                  <dt className="text-body-sm text-ink-muted">Completed</dt>
                  <dd className="font-display text-display-md leading-tight tabular">{stats.completedCount}</dd>
                </div>
                <div className="rounded-md border border-hairline bg-surface px-3 py-2.5">
                  <dt className="text-body-sm text-ink-muted">Last 30 days</dt>
                  <dd className="font-display text-display-md leading-tight tabular">{stats.completedLast30Days}</dd>
                </div>
              </dl>
              {stats.categories.length > 0 ? (
                <ul className="grid gap-1.5">
                  {stats.categories.map((c) => (
                    <li key={c.category} className="grid gap-1">
                      <p className="flex justify-between text-body-sm">
                        <span className="font-semibold">{categoryLabel(c.category as WorkoutCategory)}</span>
                        <span className="text-ink-muted tabular">{c.count}</span>
                      </p>
                      <span className="h-1.5 overflow-hidden rounded-full bg-sunken">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${Math.round((c.count / maxCategory) * 100)}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-ink-muted">No completed sessions yet — your category mix appears here.</p>
              )}
              <p className="text-body-sm text-ink-subtle">
                {stats.upcomingCount} upcoming session{stats.upcomingCount === 1 ? "" : "s"}.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Recommendations + history ───────────────────────────────── */}
        <div className="grid content-start gap-8">
          <section aria-labelledby="recs-h" className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="recs-h" className="text-heading-md font-semibold">
                  Your workouts
                </h2>
                <p className="text-body-sm text-ink-muted">
                  Generated from your profile and session history, never on page load — only when you ask.
                </p>
              </div>
              <p className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-ink-muted">
                <Sparkles className="size-4" aria-hidden /> AI or curated — always labelled
              </p>
            </div>
            <GenerateRecommendationButton goals={activeGoals} />
            {cards.length === 0 ? (
              <EmptyState
                title="No workouts yet"
                body="Generate one above. It will use your goals, level, equipment and recent sessions."
              />
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {cards.map((c) => (
                  <li key={c.id}>
                    <RecommendationCard rec={c} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="profile-edit-h" className="grid gap-4">
            <h2 id="profile-edit-h" className="text-heading-md font-semibold">
              Edit profile
            </h2>
            <FitnessProfileForm
              defaults={{
                age: profile?.age ?? null,
                weightKg: profile?.weightKg ? profile.weightKg.toString() : null,
                workoutPreferences: profile?.workoutPreferences ?? [],
                level: profile?.fitnessLevel ?? null,
                goals: activeGoals,
                goalDetails: Object.fromEntries(
                  goals.map((g) => [
                    g.goal,
                    {
                      target: g.target ?? "",
                      targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : "",
                      status: g.status,
                    },
                  ]),
                ),
                intensity: profile?.intensity ?? null,
                equipment: profile?.equipment ?? [],
                environment: profile?.environment ?? null,
                avoidExercises: profile?.avoidExercises ?? null,
                accommodations: profile?.accommodations ?? null,
                movementLimitations: profile?.movementLimitations ?? null,
                goalDetailsText: profile?.goalDetails ?? null,
              }}
            />
          </section>

          <section aria-labelledby="history-h">
            <h2 id="history-h" className="text-heading-md font-semibold">
              Recent sessions
            </h2>
            {sessions.length === 0 ? (
              <EmptyState
                className="mt-3"
                icon={Dumbbell}
                title="No completed sessions yet"
                body="Notes from your trainer appear here after each session."
              />
            ) : (
              <ol className="mt-4 grid gap-0 border-l border-hairline">
                {sessions.map((s) => {
                  const activities = parseActivities(s.activities);
                  const minutes = actualDurationMinutes(s.startedAt, s.completedAt);
                  return (
                    <li key={s.id} className="relative pb-8 pl-6 last:pb-0">
                      <span
                        className="absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-brand ring-4 ring-surface"
                        aria-hidden
                      />
                      <p className="text-body-sm text-ink-muted">
                        {formatSlot(s.startedAt)} · with {s.booking.trainer?.user.name ?? "trainer"}
                        {minutes !== null ? ` · ${minutes} min` : ""}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {activities.map((a, i) => (
                          <li key={i} className="rounded-full border border-hairline bg-raised px-3 py-1 text-body-sm">
                            <span className="font-semibold">{a.name}</span>
                            {describe(a) ? <span className="text-ink-muted"> · {describe(a)}</span> : null}
                          </li>
                        ))}
                      </ul>
                      {s.trainerNotes ? (
                        <p className="mt-3">
                          <span className="font-semibold">Trainer notes: </span>
                          {s.trainerNotes}
                        </p>
                      ) : null}
                      {s.suggestedNextWorkout ? (
                        <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-body-sm">
                          <span className="font-semibold">Suggested next (from trainer): </span>
                          {s.suggestedNextWorkout}
                        </p>
                      ) : null}
                      <p className="mt-2 text-body-sm">
                        {s.customerFeedback ? (
                          <>
                            <span className="font-semibold">Your feedback: </span>
                            {s.customerFeedback}{" "}
                          </>
                        ) : null}
                        <Link
                          href={`/customer/bookings/${s.bookingId}`}
                          className="font-semibold text-brand hover:underline"
                        >
                          {s.customerFeedback ? "Edit" : "Leave feedback"}
                        </Link>
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
