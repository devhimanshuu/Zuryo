import { MapPin } from "lucide-react";
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
}: {
  startAt: Date;
  status: BookingStatus;
  title: string;
  subtitle: string;
  showDay?: boolean;
}) {
  return (
    <li className="grid grid-cols-[72px_1fr_auto] items-center gap-3 px-4 py-3 sm:px-5">
      <div className="tabular">
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
      <StatusBadge status={status} />
    </li>
  );
}
