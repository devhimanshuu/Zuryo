import {
  ArrowRight,
  Clock,
  CreditCard,
  Dumbbell,
  MapPin,
  MessageSquareText,
  Timer,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { DateTile } from "@/components/shared/date-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { categoryLabel } from "@/lib/booking/categories";
import type { Coverage } from "@/lib/payments/coverage";
import { cn } from "@/lib/utils/cn";
import { formatINR } from "@/lib/pricing";
import { formatSlot, formatTime } from "@/lib/utils/format";
import type { BookingStatus, WorkoutCategory } from "@/lib/validation/enums";

export type BookingItemData = {
  id: string;
  reference: string;
  status: BookingStatus;
  mode: "INSTANT" | "SCHEDULED";
  startAt: Date;
  isPeak: boolean;
  totalAmount: { toString(): string };
  rescheduleCount: number;
  counterpartLabel: string;
  counterpartName: string | null;
  location: string;
  workoutCategory?: WorkoutCategory | null;
  /** Customer's note to the trainer, shown in the trainer's view. */
  notes?: string | null;
  /** Details page, when one exists for this viewer. */
  href?: string;
  /** How the booking is paid for (package session, simulated payment, …). */
  coverage?: Coverage;
  /** Actual session times from the server, once the trainer has started it. */
  session?: { startedAt: Date; completedAt: Date | null; completionSource: string | null } | null;
};

const COVERAGE_TONE: Record<Coverage["tone"], string> = {
  brand: "text-brand",
  success: "text-success",
  danger: "text-danger",
  muted: "text-ink-muted",
};

/** One booking as a list row: when, status, what, who, where, what it cost, and what you can do. */
export function BookingItem({ b, actions }: { b: BookingItemData; actions?: React.ReactNode }) {
  return (
    <article
      className={cn(
        "grid gap-4 rounded-lg border border-hairline bg-raised p-4 shadow-(--shadow-1) transition-[border-color,box-shadow] duration-200 sm:p-5",
        b.href && "hover:border-control/40 hover:shadow-(--shadow-2)",
      )}
    >
      <div className="flex gap-4">
        <DateTile date={b.startAt} className="hidden self-start sm:grid" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-heading-md font-semibold">
                  {b.href ? (
                    <Link href={b.href} className="hover:underline">
                      {formatSlot(b.startAt)}
                    </Link>
                  ) : (
                    formatSlot(b.startAt)
                  )}
                </h3>
                <StatusBadge status={b.status} rescheduled={b.rescheduleCount > 0} />
              </div>
              <p className="mt-0.5 text-body-sm text-ink-subtle tabular">
                {b.reference} · {b.mode === "INSTANT" ? "Instant" : "Scheduled"}
                {b.isPeak ? " · Peak" : ""}
              </p>
            </div>
            <p className="text-heading-md font-semibold tabular sm:text-right">
              {formatINR(b.totalAmount)}
              <span className="block text-body-sm font-normal text-ink-subtle">incl. commission</span>
            </p>
          </div>
          <BookingMeta b={b} />
        </div>
      </div>
      {b.href || actions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          {b.href ? (
            <Link
              href={b.href}
              className="group/link inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
            >
              View details{" "}
              <ArrowRight
                className="size-4 transition-transform duration-150 group-hover/link:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ) : null}
          {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </article>
  );
}

function BookingMeta({ b }: { b: BookingItemData }) {
  return (
    <>
      <ul className="mt-3 grid gap-1.5 text-body-sm text-ink-muted sm:grid-cols-2">
        {b.workoutCategory !== undefined ? (
          <li className="flex items-center gap-2">
            <Dumbbell className="size-4 text-ink-subtle" aria-hidden />
            <span className="truncate">
              <span className="sr-only">Workout: </span>
              {categoryLabel(b.workoutCategory)}
            </span>
          </li>
        ) : null}
        <li className="flex items-center gap-2">
          <UserRound className="size-4 text-ink-subtle" aria-hidden />
          <span className="truncate">
            <span className="sr-only">{b.counterpartLabel}: </span>
            {b.counterpartName ?? "Awaiting trainer assignment"}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="size-4 text-ink-subtle" aria-hidden />
          <span className="truncate">{b.location}</span>
        </li>
        <li className="flex items-center gap-2">
          <Clock className="size-4 text-ink-subtle" aria-hidden /> 60 min
        </li>
        {b.coverage ? (
          <li className={cn("flex items-center gap-2 font-semibold", COVERAGE_TONE[b.coverage.tone])}>
            <CreditCard className="size-4" aria-hidden />
            <span className="truncate">{b.coverage.label}</span>
          </li>
        ) : null}
        {b.session ? (
          <li className="flex items-center gap-2 sm:col-span-2">
            <Timer className="size-4 text-ink-subtle" aria-hidden />
            <span>
              Started {formatTime(b.session.startedAt)}
              {b.session.completedAt
                ? ` · completed ${formatTime(b.session.completedAt)}${b.session.completionSource === "DEADLINE" ? " (at the 60-minute end)" : " by the trainer"}`
                : " · in progress"}
            </span>
          </li>
        ) : null}
      </ul>
      {b.notes ? (
        <p className="mt-3 flex gap-2 rounded-md bg-sunken px-3 py-2 text-body-sm">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          <span>
            <span className="font-semibold">Customer note: </span>
            {b.notes}
          </span>
        </p>
      ) : null}
    </>
  );
}
