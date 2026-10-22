import { cn } from "@/lib/utils/cn";
import type { ActivityWeek } from "@/lib/activity";

/** Twelve-week session bars; each bar is focusable and announces its own week and count. */
export function WeeklyActivity({ weeks }: { weeks: ActivityWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const total = weeks.reduce((n, w) => n + w.count, 0);
  return (
    <div>
      <div className="flex h-20 items-end gap-1.5">
        {weeks.map((w) => (
          <span
            key={w.weekStartKey}
            role="img"
            tabIndex={0}
            aria-label={`Week of ${w.label}: ${w.count} session${w.count === 1 ? "" : "s"}`}
            className="group relative flex h-full flex-1 flex-col justify-end rounded-sm focus-visible:outline-offset-2"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-max -translate-x-1/2 rounded-md border border-hairline bg-raised px-2 py-1 text-[11px] font-semibold shadow-(--shadow-2) group-hover:block group-focus-visible:block"
            >
              {w.count} session{w.count === 1 ? "" : "s"}
            </span>
            <span
              aria-hidden
              className={cn(
                "w-full rounded-sm transition-[height,background-color] duration-300",
                w.count > 0 ? "bg-brand group-hover:bg-brand-strong" : "bg-sunken",
              )}
              style={{ height: w.count > 0 ? `${Math.max(10, Math.round((w.count / max) * 100))}%` : "3px" }}
            />
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {weeks.map((w, i) => (
          <span key={w.weekStartKey} className="flex-1 text-center text-[9px] text-ink-subtle">
            {i % 3 === 0 ? w.label : ""}
          </span>
        ))}
      </div>
      <p className="sr-only">
        {total} completed session{total === 1 ? "" : "s"} in the last {weeks.length} weeks.
      </p>
    </div>
  );
}
