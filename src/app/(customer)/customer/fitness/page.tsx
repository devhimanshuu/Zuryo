import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, EmptyState, PhaseNote } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safely } from "@/lib/utils/errors";
import { formatSlot, titleCase } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { getCustomerFitness } from "@/server/queries/customer";

export const metadata: Metadata = { title: "Fitness" };

type Activity = { name?: string; sets?: number; reps?: number; durationMin?: number; durationSec?: number };

function describe(a: Activity) {
  const parts = [a.sets && a.reps ? `${a.sets} × ${a.reps}` : a.sets ? `${a.sets} sets` : null];
  if (a.durationMin) parts.push(`${a.durationMin} min`);
  if (a.durationSec) parts.push(`${a.durationSec}s`);
  return parts.filter(Boolean).join(" · ");
}

export default async function FitnessPage() {
  const actor = await getActor("CUSTOMER");
  const result = await safely(() => getCustomerFitness(actor.userId));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { profile, sessions } = result.data;

  return (
    <div>
      <PageHeader editorial title="Fitness" description="Your profile and every completed session." />
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {profile?.assessedAt ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-body-md">
                <dt className="text-ink-muted">Age</dt>
                <dd className="font-semibold tabular">{profile.age ?? "—"}</dd>
                <dt className="text-ink-muted">Weight</dt>
                <dd className="font-semibold tabular">
                  {profile.weightKg ? `${profile.weightKg.toString()} kg` : "—"}
                </dd>
                <dt className="text-ink-muted">Level</dt>
                <dd className="font-semibold">
                  {profile.fitnessLevel ? titleCase(profile.fitnessLevel) : "—"}
                </dd>
                <dt className="text-ink-muted">Goals</dt>
                <dd className="font-semibold">{profile.fitnessGoals.map(titleCase).join(", ") || "—"}</dd>
                <dt className="text-ink-muted">Prefers</dt>
                <dd className="font-semibold">
                  {profile.workoutPreferences.map(titleCase).join(", ") || "—"}
                </dd>
              </dl>
            ) : (
              <p className="text-ink-muted">No assessment yet.</p>
            )}
            <div className="mt-5">
              <PhaseNote>The guided assessment form for creating and editing this profile.</PhaseNote>
            </div>
          </CardContent>
        </Card>

        <section aria-labelledby="history-h">
          <h2 id="history-h" className="text-heading-md font-semibold">
            Session history
          </h2>
          {sessions.length === 0 ? (
            <EmptyState
              className="mt-3"
              title="No completed sessions yet"
              body="Notes from your trainer will appear here after each session."
            />
          ) : (
            <ol className="mt-4 grid gap-0 border-l border-hairline">
              {sessions.map((s) => {
                const activities = (Array.isArray(s.activities) ? s.activities : []) as Activity[];
                return (
                  <li key={s.id} className="relative pb-8 pl-6 last:pb-0">
                    <span
                      className="absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-brand"
                      aria-hidden
                    />
                    <p className="text-body-sm text-ink-muted">
                      {formatSlot(s.startedAt)} · with {s.booking.trainer?.user.name ?? "trainer"}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {activities.map((a, i) => (
                        <li
                          key={i}
                          className="rounded-full border border-hairline bg-raised px-3 py-1 text-body-sm"
                        >
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
                    {s.customerFeedback ? (
                      <p className="mt-1 text-ink-muted">
                        <span className="font-semibold text-ink">Your feedback: </span>
                        {s.customerFeedback}
                      </p>
                    ) : null}
                    {s.suggestedNextWorkout ? (
                      <p className="mt-2 rounded-md bg-sunken px-3 py-2 text-body-sm">
                        <span className="font-semibold">Suggested next (from trainer): </span>
                        {s.suggestedNextWorkout}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-6 flex items-start gap-2 text-body-sm text-ink-muted">
            <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
            Planned: AI workout recommendations based on this history, clearly labelled as AI-generated.
          </p>
        </section>
      </div>
    </div>
  );
}
