import { ArrowLeft, CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState, Notice } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CancelBookingButton } from "@/features/bookings/cancel-booking-button";
import { PriceBreakdown } from "@/features/bookings/price-breakdown";
import { CANCELLATION_POLICY_NOTE, cancellationBlocker } from "@/lib/booking/cancellation";
import { categoryLabel } from "@/lib/booking/categories";
import { safely } from "@/lib/utils/errors";
import { formatDay, formatSlot, formatTime } from "@/lib/utils/format";
import { getActor } from "@/server/auth/actor";
import { getBookingForActor } from "@/server/booking/booking-service";
import { defaultDeps } from "@/server/booking/deps";

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
  const result = await safely(() => getBookingForActor(defaultDeps(), actor, id));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const b = result.data;
  if (!b) notFound();

  const tz = b.serviceZone.timezone;
  const now = new Date();
  const blocker = cancellationBlocker(b, now);
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
      <Link
        href="/customer/bookings"
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> My bookings
      </Link>

      {created === "1" && b.status === "CONFIRMED" ? (
        <Notice tone="success" title="You're booked" live>
          {trainerName ? `${trainerName} has been notified. ` : ""}Your reference is{" "}
          <span className="font-semibold tabular">{b.reference}</span>.
        </Notice>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase tabular">
            {b.reference}
          </p>
          <h1 className="font-display text-display-md">
            {categoryLabel(b.workoutCategory)}
            {trainerName ? ` with ${trainerName.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-ink-muted">{formatSlot(b.startAt, tz)} IST</p>
        </div>
        <StatusBadge status={b.status} rescheduled={b.rescheduleCount > 0} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle>Price</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PriceBreakdown price={b} />
              <p className="text-body-sm text-ink-subtle">
                Recorded when you booked ({b.pricingRule.name}). Later pricing changes don&apos;t affect it.
              </p>
              <Notice tone="info">
                Payment isn&apos;t collected yet. Checkout arrives in a later phase.
              </Notice>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manage</CardTitle>
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
              <p className="text-body-sm text-ink-subtle">Rescheduling isn&apos;t available yet.</p>
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
