import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDay, formatTime } from "@/lib/utils/format";
import type { BookingStatus } from "@/lib/validation/enums";

/** Dense, time-first row for operational lists (trainer schedule, ops queues). */
export function ScheduleRow({
  startAt,
  status,
  title,
  subtitle,
  showDay,
  href,
}: {
  startAt: Date;
  status: BookingStatus;
  title: string;
  subtitle: string;
  showDay?: boolean;
  /** Makes the whole row a link to the booking or session page. */
  href?: string;
}) {
  const body = (
    <>
      <div className="border-l-2 border-brand/70 pl-3 tabular">
        <p className="font-semibold">{formatTime(startAt)}</p>
        {showDay ? <p className="text-body-sm text-ink-subtle">{formatDay(startAt)}</p> : null}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        <p className="flex items-center gap-1 truncate text-body-sm text-ink-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {subtitle}
        </p>
      </div>
      <span className="flex items-center gap-2">
        <StatusBadge status={status} />
        {href ? (
          <ChevronRight
            className="size-4 text-ink-subtle transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden
          />
        ) : null}
      </span>
    </>
  );
  const layout = "grid grid-cols-[92px_1fr_auto] items-center gap-3 px-4 py-3 sm:px-5";
  return (
    <li>
      {href ? (
        <Link href={href} className={`group ${layout} transition-colors hover:bg-sunken/50`}>
          {body}
        </Link>
      ) : (
        <div className={layout}>{body}</div>
      )}
    </li>
  );
}
