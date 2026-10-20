import { ArrowLeft, MapPin, MessageSquareText, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionConsole } from "@/features/sessions/session-console";
import { SessionSummaryForm } from "@/features/sessions/session-summary-form";
import { categoryLabel } from "@/lib/booking/categories";
import { startWindow } from "@/lib/sessions/lifecycle";
import { GOAL_LABELS } from "@/lib/fitness/labels";
import { safely } from "@/lib/utils/errors";
import { formatSlot, formatTime, titleCase } from "@/lib/utils/format";
import { actualDurationMinutes, parseActivities } from "@/lib/validation/sessions";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import { getSessionForTrainer } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "Session" };

export default async function TrainerSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor("TRAINER");
  // Only the assigned trainer gets a result; reconciled against the clock before it is read.
  const result = await safely(() => getSessionForTrainer(defaultDeps(), actor, id));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const b = result.data;
  if (!b) notFound();

  const tz = b.serviceZone.timezone;
  const s = b.sessionRecord;
  const startAllowed = startWindow(b.startAt);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <Link
        href="/trainer/sessions"
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> My sessions
      </Link>
      <header>
        <p className="mb-1 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase tabular">
          {b.reference}
        </p>
        <h1 className="text-heading-lg font-semibold tracking-tight">
          {categoryLabel(b.workoutCategory)} with {b.customer.user.name}
        </h1>
        <p className="mt-1 text-ink-muted">
          {formatSlot(b.startAt, tz)} – {formatTime(b.endAt, tz)} IST · {b.mode === "INSTANT" ? "Instant" : "Scheduled"}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <SessionConsole
          initial={{
            bookingId: b.id,
            status: b.status,
            startedAt: s?.startedAt.toISOString() ?? null,
            endsAt: s?.endsAt.toISOString() ?? null,
            plannedMinutes: s?.plannedMinutes ?? 60,
            warningSentAt: s?.warningSentAt?.toISOString() ?? null,
            completedAt: s?.completedAt?.toISOString() ?? null,
            completionSource: s?.completionSource ?? null,
            serverNow: now.toISOString(),
          }}
          scheduledStart={b.startAt.toISOString()}
          startOpensAt={startAllowed.opensAt.toISOString()}
          startClosesAt={startAllowed.closesAt.toISOString()}
          tz={tz}
        />

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-body-md">
            <p className="flex items-center gap-2">
              <UserRound className="size-4 text-ink-subtle" aria-hidden />
              <span className="font-semibold">{b.customer.user.name}</span>
            </p>
            <p className="flex items-center gap-2 text-ink-muted">
              <MapPin className="size-4 text-ink-subtle" aria-hidden />
              {b.serviceZone.name}
              {b.customer.addressLine ? `, ${b.customer.addressLine}` : ""}
            </p>
            {b.customer.fitnessGoals.length > 0 || b.customer.fitnessLevel ? (
              <div className="rounded-md bg-sunken px-3 py-2 text-body-sm">
                <p className="font-semibold">Customer context</p>
                <p className="mt-1">
                  <span className="font-semibold">
                    {b.customer.fitnessLevel ? titleCase(b.customer.fitnessLevel) : "Level not stated"}
                  </span>
                  {b.customer.fitnessGoals.length > 0 ? (
                    <> · goals: {b.customer.fitnessGoals.map((g) => GOAL_LABELS[g]).join(", ")}</>
                  ) : null}
                </p>
              </div>
            ) : null}
            {b.customerNotes ? (
              <p className="flex gap-2 rounded-md bg-sunken px-3 py-2 text-body-sm">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                <span>
                  <span className="font-semibold">Note: </span>
                  {b.customerNotes}
                </span>
              </p>
            ) : null}
            <p className="text-body-sm text-ink-muted">
              {b.package ? `Covered by the customer's ${b.package.name}.` : b.payments.length ? "Paid per session (simulated)." : "No payment recorded."}
            </p>
            {s?.completedAt ? (
              <p className="text-body-sm text-ink-muted">
                Ran {actualDurationMinutes(s.startedAt, s.completedAt)} minutes (server timestamps).
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {s && (b.status === "IN_PROGRESS" || b.status === "COMPLETED") ? (
        <SessionSummaryForm
          bookingId={b.id}
          defaults={{
            activities: parseActivities(s.activities),
            trainerNotes: s.trainerNotes,
            suggestedNextWorkout: s.suggestedNextWorkout,
          }}
          customerFeedback={s.customerFeedback}
        />
      ) : null}
    </div>
  );
}
