import { Clock, MapPin, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/pricing";
import { formatSlot } from "@/lib/utils/format";
import type { BookingStatus } from "@/lib/validation/enums";

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
};

/** One booking as a list row: when, status, who, where, what it cost. Actions arrive in Phase 2. */
export function BookingItem({ b }: { b: BookingItemData }) {
  return (
    <article className="grid gap-3 rounded-lg border border-hairline bg-raised p-4 sm:grid-cols-[1fr_auto] sm:items-start sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-heading-md font-semibold">{formatSlot(b.startAt)}</h3>
          <StatusBadge status={b.status} rescheduled={b.rescheduleCount > 0} />
        </div>
        <p className="mt-0.5 text-body-sm text-ink-subtle tabular">
          {b.reference} · {b.mode === "INSTANT" ? "Instant" : "Scheduled"}
          {b.isPeak ? " · Peak" : ""}
        </p>
        <ul className="mt-3 grid gap-1.5 text-body-sm text-ink-muted sm:grid-cols-2">
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
        </ul>
      </div>
      <p className="text-heading-md font-semibold tabular sm:text-right">
        {formatINR(b.totalAmount)}
        <span className="block text-body-sm font-normal text-ink-subtle">incl. commission</span>
      </p>
    </article>
  );
}
