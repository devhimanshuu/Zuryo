import { Car, MapPin, MessageSquareText, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/shared/avatar";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardIcon, CardTitle } from "@/components/ui/card";
import { SessionConsole } from "@/features/sessions/session-console";
import { BookingTimeline } from "@/features/bookings/booking-timeline";
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
  const trip = b.status === "CONFIRMED" && b.startAt > now ? b.trip : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        breadcrumbs={[
          { href: "/trainer", label: "Today" },
          { href: "/trainer/sessions", label: "My sessions" },
          { label: <span className="tabular">{b.reference}</span> },
        ]}
        eyebrow={<span className="tabular">{b.reference}</span>}
        title={`${categoryLabel(b.workoutCategory)} with ${b.customer.user.name}`}
        description={`${formatSlot(b.startAt, tz)} – ${formatTime(b.endAt, tz)} IST · ${b.mode === "INSTANT" ? "Instant" : "Scheduled"}`}
        className="pb-0"
      />

      <BookingTimeline status={b.status} startAt={b.startAt} endAt={b.endAt} />

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
            <CardIcon icon={UserRound} />
          </CardHeader>
          <CardContent className="grid gap-3 text-body-md">
            <p className="flex items-center gap-3">
              <Avatar name={b.customer.user.name} />
              <span className="font-semibold">{b.customer.user.name}</span>
            </p>
            <p className="flex items-center gap-2 text-ink-muted">
              <MapPin className="size-4 text-ink-subtle" aria-hidden />
              {b.serviceZone.name}
              {b.customer.addressLine ? `, ${b.customer.addressLine}` : ""}
            </p>
            {trip ? (
              <p className="flex gap-2 rounded-md bg-info-soft px-3 py-2 text-body-sm text-info">
                <Car className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">
                    Set out by {formatTime(new Date(trip.departAt), tz)}
                  </span>{" "}
                  · {trip.roadKm.toFixed(1)} km from your base, about {trip.travelMinutes} min. The customer sees this
                  estimate (simulated location).
                </span>
              </p>
            ) : null}
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
