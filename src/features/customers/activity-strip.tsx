import { cn } from "@/lib/utils/cn";
import type { ActivityDay } from "@/lib/activity";

/** Fourteen-day session bars. Visual only; the summary sentence carries the meaning for SRs. */
export function ActivityStrip({ days, className }: { days: ActivityDay[]; className?: string }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  return (
    <div className={className}>
      <div className="flex h-14 items-end gap-1" aria-hidden>
        {days.map((d) => (
          <span
            key={d.dateKey}
            title={`${d.label}: ${d.count} session${d.count === 1 ? "" : "s"}`}
            className="flex h-full flex-1 flex-col justify-end"
          >
            <span
              className={cn(
                "w-full rounded-sm transition-[height] duration-300",
                d.count > 0 ? "bg-brand" : "bg-sunken",
              )}
              style={{ height: d.count > 0 ? `${Math.max(14, Math.round((d.count / max) * 100))}%` : "4px" }}
            />
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {days.map((d) => (
          <span key={d.dateKey} className="flex-1 text-center text-[9px] text-ink-subtle">
            {d.label[0]}
          </span>
        ))}
      </div>
      <p className="sr-only">
        {total} completed session{total === 1 ? "" : "s"} in the last {days.length} days.
      </p>
    </div>
  );
}
