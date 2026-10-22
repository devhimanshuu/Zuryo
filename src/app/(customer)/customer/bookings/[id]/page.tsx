import { CalendarDays, CalendarPlus, Dumbbell, Navigation, ReceiptText, Settings2, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, Notice } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardIcon, CardTitle } from "@/components/ui/card";
import { CancelBookingButton } from "@/features/bookings/cancel-booking-button";
import { RescheduleBookingButton } from "@/features/bookings/reschedule-booking-button";
import { PriceBreakdown } from "@/features/bookings/price-breakdown";
import { TrainerArrival } from "@/features/location/trainer-arrival";
import { LiveSessionStatus } from "@/features/sessions/live-session-status";
import { SessionFeedbackForm } from "@/features/sessions/session-feedback-form";
import { CANCELLATION_POLICY_NOTE, cancellationBlocker } from "@/lib/booking/cancellation";
import { categoryLabel } from "@/lib/booking/categories";
import { RESCHEDULE_POLICY_NOTE, rescheduleBlocker } from "@/lib/booking/reschedule";
import { coverageSummary } from "@/lib/payments/coverage";
import { safely } from "@/lib/utils/errors";
import { formatDay, formatSlot, formatTime } from "@/lib/utils/format";
import { actualDurationMinutes, parseActivities } from "@/lib/validation/sessions";
import { getActor } from "@/server/auth/actor";
import { getBookingForActor } from "@/server/booking/booking-service";
import { defaultDeps } from "@/server/booking/deps";
import { reconcileDueSessions } from "@/server/sessions/session-service";

export const metadata: Metadata = { title: "Booking details" };

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const actor = await getActor("CUSTOMER");
  // Scoped to the acting customer: someone else's booking id resolves to "not found".
  const result = await safely(async () => {
    const deps = defaultDeps();
    await reconcileDueSessions(deps, { customerId: actor.userId });
    return getBookingForActor(deps, actor, id);
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const b = result.data;
  if (!b) notFound();

  const tz = b.serviceZone.timezone;
  const now = new Date();
  const blocker = cancellationBlocker(b, now);
  const moveBlocker = rescheduleBlocker(b, now);
  const coverage = coverageSummary(b);
  const trip = b.status === "CONFIRMED" && b.startAt > now ? b.trip : null;
  const payment = b.payments[0];
  const trainerName = b.trainer?.user.name ?? null;
  const cancelledBy =
    b.cancelledBy?.id === actor.userId
      ? "you"
      : b.cancelledBy?.role === "TRAINER"
        ? "your trainer"
        : b.cancelledBy?.role === "OPERATIONS"
          ? "Zuryo operations"
          : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        editorial
        back={{ href: "/customer/bookings", label: "My bookings" }}
        eyebrow={<span className="tabular">{b.reference}</span>}
        title={`${categoryLabel(b.workoutCategory)}${trainerName ? ` with ${trainerName.split(" ")[0]}` : ""}`}
        description={`${formatSlot(b.startAt, tz)} IST`}
        actions={<StatusBadge status={b.status} rescheduled={b.rescheduleCount > 0} />}
        className="pb-0"
      />

      {created === "1" && b.status === "CONFIRMED" ? (
        <Notice tone="success" title="You're booked" live>
          {trainerName ? `${trainerName} has been notified. ` : ""}Your reference is{" "}
          <span className="font-semibold tabular">{b.reference}</span>.
        </Notice>
      ) : null}

      {b.status === "IN_PROGRESS" && b.sessionRecord && !b.sessionRecord.completedAt ? (
        <section
          aria-label="Live session"
          className="relative isolate overflow-hidden rounded-lg bg-inverse p-5 text-ink-inverse shadow-(--shadow-3) sm:p-6"
        >
          <div aria-hidden className="absolute -top-20 -right-10 -z-10 size-64 rounded-full bg-accent/25 blur-3xl" />
          <LiveSessionStatus
            inverse
            startedAt={b.sessionRecord.startedAt.toISOString()}
            endsAt={b.sessionRecord.endsAt.toISOString()}
            serverNow={now.toISOString()}
            tz={tz}
          />
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardIcon icon={CalendarDays} />
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
              <Row label="Date">{formatDay(b.startAt, tz)}</Row>
              <Row label="Time">
                {formatTime(b.startAt, tz)} – {formatTime(b.endAt, tz)} IST
              </Row>
              <Row label="Duration">60 minutes</Row>
              <Row label="Session type">{b.mode === "INSTANT" ? "Instant" : "Scheduled"}</Row>
              <Row label="Workout">{categoryLabel(b.workoutCategory)}</Row>
              <Row label="Trainer">
                {trainerName ?? "Awaiting trainer assignment"}
                {b.trainer?.specializations.length ? (
                  <span className="block text-body-sm font-normal text-ink-muted">
                    {b.trainer.specializations.join(" · ")}
                  </span>
                ) : null}
              </Row>
              <Row label="Where">
                {b.serviceZone.name}
                {b.customer.addressLine ? `, ${b.customer.addressLine}` : ""}
              </Row>
              {b.customerNotes ? <Row label="Your note">{b.customerNotes}</Row> : null}
              {b.status === "CANCELLED" && b.cancelledAt ? (
                <Row label="Cancelled">
                  {formatSlot(b.cancelledAt, tz)}
                  {cancelledBy ? ` by ${cancelledBy}` : ""}
                  {b.cancellationReason ? (
                    <span className="block text-body-sm font-normal text-ink-muted">
                      Reason: {b.cancellationReason}
                    </span>
                  ) : null}
                </Row>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          {trip && trainerName ? (
            <Card>
              <CardHeader>
                <CardTitle>Trainer arrival</CardTitle>
                <CardIcon icon={Navigation} />
              </CardHeader>
              <CardContent>
                <TrainerArrival
                  trip={trip}
                  trainerName={trainerName}
                  zoneName={b.serviceZone.name}
                  serverNow={now.toISOString()}
                  tz={tz}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Price</CardTitle>
              <CardIcon icon={ReceiptText} />
            </CardHeader>
            <CardContent className="grid gap-3">
              <PriceBreakdown price={b} />
              <p className="text-body-sm text-ink-subtle">
                Recorded when you booked ({b.pricingRule.name}). Later pricing changes don&apos;t affect it.
              </p>
              <div className="grid gap-1.5 rounded-md bg-sunken px-3 py-2.5 text-body-sm">
                <p className="font-semibold">{coverage.label}</p>
                {b.package ? (
                  <p className="text-ink-muted">
                    Covered by your package, so nothing was charged for this booking.{" "}
                    {b.package.totalSessions - b.package.usedSessions} of {b.package.totalSessions} sessions left.{" "}
                    <Link href="/customer/packages" className="font-semibold text-brand hover:underline">
                      Package history
                    </Link>
                  </p>
                ) : payment ? (
                  <p className="text-ink-muted">
                    Simulated payment {payment.providerReference}
                    {payment.completedAt ? ` · ${formatSlot(payment.completedAt, tz)}` : ""}
                    {payment.refundedAt ? ` · refunded ${formatSlot(payment.refundedAt, tz)}` : ""}
                    {payment.failureReason ? ` · ${payment.failureReason}` : ""}. No real money moved.
                  </p>
                ) : (
                  <p className="text-ink-muted">This booking was made before checkout existed.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {b.sessionRecord ? (
            <Card>
              <CardHeader>
                <CardTitle>Session timeline</CardTitle>
                <CardIcon icon={Timer} />
              </CardHeader>
              <CardContent>
                <ol className="grid gap-2 text-body-sm">
                  <li className="flex justify-between gap-3">
                    <span className="text-ink-muted">Started</span>
                    <span className="font-semibold tabular">{formatTime(b.sessionRecord.startedAt, tz)}</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-ink-muted">Wrap-up reminder</span>
                    <span className="font-semibold tabular">
                      {b.sessionRecord.warningSentAt ? formatTime(b.sessionRecord.warningSentAt, tz) : "Not yet"}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-ink-muted">Ends</span>
                    <span className="font-semibold tabular">{formatTime(b.sessionRecord.endsAt, tz)}</span>
                  </li>
                  <li className="flex justify-between gap-3 border-t border-hairline pt-2">
                    <span className="text-ink-muted">Completed</span>
                    <span className="font-semibold tabular">
                      {b.sessionRecord.completedAt
                        ? `${formatTime(b.sessionRecord.completedAt, tz)}${b.sessionRecord.completionSource === "DEADLINE" ? " (at the 60-minute end)" : " (by your trainer)"}`
                        : "In progress"}
                    </span>
                  </li>
                </ol>
                <p className="mt-3 text-body-sm text-ink-subtle">Times are recorded by Zuryo&apos;s server.</p>
              </CardContent>
            </Card>
          ) : null}

          {b.sessionRecord?.completedAt ? <SessionSummary booking={b} /> : null}

          <Card>
            <CardHeader>
              <CardTitle>Manage</CardTitle>
              <CardIcon icon={Settings2} />
            </CardHeader>
            <CardContent className="grid gap-3">
              {blocker ? (
                <p className="text-body-sm text-ink-muted">{blocker}</p>
              ) : (
                <>
                  <p className="text-body-sm text-ink-muted">{CANCELLATION_POLICY_NOTE}</p>
                  <div>
                    <CancelBookingButton
                      as="CUSTOMER"
                      bookingId={b.id}
                      reference={b.reference}
                      whenLabel={`${formatSlot(b.startAt, tz)}${trainerName ? ` with ${trainerName}` : ""}`}
                      size="md"
                    />
                  </div>
                </>
              )}
              {moveBlocker ? (
                blocker ? null : <p className="text-body-sm text-ink-muted">{moveBlocker}</p>
              ) : (
                <>
                  <p className="text-body-sm text-ink-muted">{RESCHEDULE_POLICY_NOTE}</p>
                  <div>
                    <RescheduleBookingButton bookingId={b.id} reference={b.reference} />
                  </div>
                </>
              )}
              {b.rescheduleCount > 0 && b.lastRescheduledAt ? (
                <p className="text-body-sm text-ink-subtle">
                  Moved {b.rescheduleCount} time{b.rescheduleCount === 1 ? "" : "s"}, last on {formatSlot(b.lastRescheduledAt, tz)}.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Button asChild variant="ghost" className="justify-self-start">
            <Link href="/customer/bookings/new">
              <CalendarPlus aria-hidden /> Book another session
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-body-sm text-ink-muted sm:pt-0.5">{label}</dt>
      <dd className="-mt-2 font-semibold break-words sm:mt-0">{children}</dd>
    </>
  );
}

type SessionRecordView = {
  startedAt: Date;
  completedAt: Date | null;
  activities: unknown;
  trainerNotes: string | null;
  suggestedNextWorkout: string | null;
  customerFeedback: string | null;
};

/** The trainer's structured record of a completed session, and the customer's feedback on it. */
function SessionSummary({
  booking,
}: {
  booking: { id: string; status: string; sessionRecord: SessionRecordView | null };
}) {
  const s = booking.sessionRecord!;
  const activities = parseActivities(s.activities);
  const minutes = actualDurationMinutes(s.startedAt, s.completedAt);
  return (
    <Card>
      <CardHeader>
        <CardTitle>What you did</CardTitle>
        <CardIcon icon={Dumbbell} />
      </CardHeader>
      <CardContent className="grid gap-3 text-body-sm">
        {minutes !== null ? <p className="text-ink-muted">Duration: {minutes} minutes</p> : null}
        {activities.length > 0 ? (
          <ul className="grid gap-1.5">
            {activities.map((a, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="font-semibold">{a.name}</span>
                <span className="text-ink-muted tabular">
                  {[
                    a.sets && a.reps ? `${a.sets} × ${a.reps}` : a.sets ? `${a.sets} sets` : null,
                    a.durationMin ? `${a.durationMin} min` : null,
                    a.durationSec ? `${a.durationSec}s` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">Your trainer hasn&apos;t added the exercises yet.</p>
        )}
        {s.trainerNotes ? (
          <p>
            <span className="font-semibold">Trainer notes: </span>
            {s.trainerNotes}
          </p>
        ) : null}
        {s.suggestedNextWorkout ? (
          <p className="rounded-md bg-sunken px-3 py-2">
            <span className="font-semibold">Suggested next: </span>
            {s.suggestedNextWorkout}
          </p>
        ) : null}
        {booking.status === "COMPLETED" ? (
          <div className="border-t border-hairline pt-3">
            <SessionFeedbackForm bookingId={booking.id} current={s.customerFeedback} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
