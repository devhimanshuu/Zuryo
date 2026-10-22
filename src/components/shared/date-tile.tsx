import { cn } from "@/lib/utils/cn";
import { DEFAULT_TZ, dateParts } from "@/lib/utils/format";

/**
 * Calendar-page tile (month band over the day number) that anchors a booking visually.
 * Decorative: the full date is always written out in the adjacent text.
 */
export function DateTile({
  date,
  tz = DEFAULT_TZ,
  inverse,
  className,
}: {
  date: Date;
  tz?: string;
  inverse?: boolean;
  className?: string;
}) {
  const { day, month } = dateParts(date, tz);
  return (
    <span
      aria-hidden
      className={cn(
        "grid w-14 shrink-0 overflow-hidden rounded-md border text-center",
        inverse
          ? "border-ink-inverse/20 bg-ink-inverse/10 text-ink-inverse"
          : "border-hairline bg-raised shadow-(--shadow-1)",
        className,
      )}
    >
      <span
        className={cn(
          "py-0.5 text-[10px] leading-4 font-semibold tracking-[0.1em] uppercase",
          inverse ? "bg-ink-inverse/15" : "bg-brand text-on-brand",
        )}
      >
        {month}
      </span>
      <span className="pt-1.5 pb-1 font-display text-[1.75rem] leading-none tabular">{day}</span>
    </span>
  );
}
