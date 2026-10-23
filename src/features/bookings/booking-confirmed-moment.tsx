"use client";

import { CalendarCheck, Check, CircleCheck, Download } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-button";
import { SpotIllustration } from "@/components/shared/spot-illustration";
import { Button } from "@/components/ui/button";
import { formatSlot } from "@/lib/utils/format";

/**
 * The booking-success moment. The pieces arrive in a short sequence via CSS delays (no timers), so
 * the content is in the HTML for screen readers and still appears when JavaScript or motion is off.
 */
export function BookingConfirmedMoment({
  bookingId,
  reference,
  trainerName,
  startAt,
  tz,
  where,
  workout,
}: {
  bookingId: string;
  reference: string;
  trainerName: string | null;
  startAt: string;
  tz: string;
  where: string;
  workout: string;
}) {
  return (
    <section
      role="status"
      aria-label="Booking confirmed"
      className="relative isolate overflow-hidden rounded-lg border border-success/30 bg-success-soft/60 p-5 sm:p-6"
    >
      <SpotIllustration
        variant="success"
        className="pointer-events-none absolute -right-4 -bottom-10 -z-10 h-36 w-52 text-success/50"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <span
            className="grid size-11 shrink-0 animate-pop place-items-center rounded-full bg-success-soft text-success ring-4 ring-success/15"
            aria-hidden
          >
            <CircleCheck className="size-5" />
          </span>
          <div>
            <p className="animate-rise font-semibold">You&apos;re booked</p>
            <p className="animate-rise max-w-prose text-body-sm text-ink-muted [animation-delay:110ms]">
              {trainerName ? `${trainerName} has been notified. ` : ""}Your reference is{" "}
              <span className="font-semibold text-ink tabular">{reference}</span>.
            </p>
            <p className="animate-rise mt-1 text-body-sm text-ink-muted [animation-delay:180ms]">
              {workout} · {formatSlot(new Date(startAt), tz)} · {where}
            </p>
          </div>
        </div>
        <div className="flex animate-rise flex-wrap gap-2 [animation-delay:260ms]">
          <CopyButton value={reference} label="Copy reference" />
          <Button asChild variant="secondary" size="sm">
            <a href={`/customer/bookings/${bookingId}/calendar`} download={`zuryofit-${reference}.ics`}>
              <Download aria-hidden /> Add to calendar
            </a>
          </Button>
        </div>
      </div>
      <ul className="relative mt-4 flex animate-rise flex-wrap gap-x-4 gap-y-2 border-t border-success/20 pt-3 text-body-sm font-semibold text-success [animation-delay:380ms]">
        <li className="inline-flex items-center gap-1.5">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> Slot held
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> {trainerName ?? "Trainer"} notified
        </li>
        <li className="inline-flex items-center gap-1.5 text-ink-muted">
          <CalendarCheck className="size-3.5" aria-hidden /> Calendar file ready
        </li>
      </ul>
    </section>
  );
}
