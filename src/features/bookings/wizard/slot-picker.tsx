"use client";

import { CalendarX2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMinutes, localMinuteOfDay, zonedDayStart } from "@/lib/booking/time";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/utils/format";
import type { DaySchedule, ScheduleView, SlotStatus, SlotView } from "@/server/booking/availability-service";

const DISABLED_LABEL: Record<Exclude<SlotStatus, "AVAILABLE">, string> = {
  PAST: "Past",
  INSTANT_WINDOW: "Use Instant",
  TOO_FAR: "Too far ahead",
  YOU_ARE_BOOKED: "You're booked",
  UNAVAILABLE: "No trainer",
  PRICE_DIFFERS: "Other price",
};

const DISABLED_SR: Record<Exclude<SlotStatus, "AVAILABLE">, string> = {
  PAST: "this time has passed",
  INSTANT_WINDOW: "starts within the hour, book it as an instant session",
  TOO_FAR: "too far ahead to book",
  YOU_ARE_BOOKED: "you already have a session at this time",
  UNAVAILABLE: "no trainer is free",
  PRICE_DIFFERS: "costs a different amount than you paid",
};

function dayLabels(day: DaySchedule, todayKey: string, tz: string) {
  const midday = addMinutes(zonedDayStart(day.dateKey, tz), 12 * 60);
  const weekday = new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short" }).format(midday);
  const date = new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "numeric", month: "short" }).format(
    midday,
  );
  const long = new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(midday);
  const tomorrowKey = new Date(Date.parse(`${todayKey}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const relative = day.dateKey === todayKey ? "Today" : day.dateKey === tomorrowKey ? "Tomorrow" : weekday;
  return { relative, date, long };
}

const GROUPS = [
  { id: "morning", label: "Morning", test: (m: number) => m < 12 * 60 },
  { id: "afternoon", label: "Afternoon", test: (m: number) => m >= 12 * 60 && m < 17 * 60 },
  { id: "evening", label: "Evening", test: (m: number) => m >= 17 * 60 },
];

export function SlotPicker({
  schedule,
  dateKey,
  selected,
  onDate,
  onSelect,
  onRefresh,
}: {
  schedule: ScheduleView;
  dateKey: string | null;
  selected: string | null;
  onDate: (key: string) => void;
  onSelect: (startAt: string) => void;
  onRefresh: () => void;
}) {
  const tz = schedule.timeZone;
  const day = schedule.days.find((d) => d.dateKey === dateKey) ?? schedule.days[0];
  const totalOpen = schedule.days.reduce((n, d) => n + d.availableCount, 0);
  const nextOpenDay = day
    ? schedule.days.find((d) => d.dateKey > day.dateKey && d.availableCount > 0)
    : undefined;

  if (!day) return null;
  const labels = dayLabels(day, schedule.todayKey, tz);
  const visible = day.slots.filter((s) => s.status !== "PAST");
  const hiddenPast = day.slots.length - visible.length;
  const prices = [...new Map(visible.map((s) => [`${s.isPeak}`, s])).values()].sort(
    (a, b) => Number(a.isPeak) - Number(b.isPeak),
  );

  return (
    <div className="grid gap-5">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-semibold">Date</legend>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-0.5 pb-2">
          {schedule.days.map((d) => {
            const l = dayLabels(d, schedule.todayKey, tz);
            const isSelected = d.dateKey === day.dateKey;
            return (
              <button
                key={d.dateKey}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${l.long}, ${d.availableCount === 0 ? "no open slots" : `${d.availableCount} open slots`}`}
                onClick={() => onDate(d.dateKey)}
                className={cn(
                  "grid w-[4.75rem] shrink-0 snap-start justify-items-center gap-0.5 rounded-md border px-2 py-2.5 text-center transition-colors",
                  isSelected
                    ? "border-brand bg-brand text-on-brand"
                    : "border-hairline bg-raised hover:border-control",
                  !isSelected && d.availableCount === 0 && "text-ink-subtle",
                )}
              >
                <span className="text-[11px] font-semibold tracking-wide uppercase">{l.relative}</span>
                <span className="text-sm font-semibold tabular">{l.date}</span>
                <span
                  className={cn(
                    "text-[11px] tabular",
                    isSelected ? "text-on-brand/85" : d.availableCount ? "text-brand" : "text-ink-subtle",
                  )}
                >
                  {d.availableCount ? `${d.availableCount} open` : "No slots"}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{labels.long}</p>
        <div className="flex flex-wrap items-center gap-3 text-body-sm text-ink-muted">
          {prices.map((p) => (
            <span key={String(p.isPeak)} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", p.isPeak ? "bg-accent" : "bg-brand")} aria-hidden />
              {p.isPeak ? "Peak" : "Standard"} {formatINR(p.totalAmount)}
            </span>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
            <RotateCcw aria-hidden /> Refresh
          </Button>
        </div>
      </div>

      {totalOpen === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-lg border border-dashed border-control bg-raised px-5 py-8 text-center">
          <CalendarX2 className="size-6 text-ink-muted" aria-hidden />
          <p className="font-semibold">No open slots in the next {schedule.days.length} days</p>
          <p className="max-w-[44ch] text-body-sm text-ink-muted">
            No trainer for this workout has opened time yet. Try another workout type, or check back later.
          </p>
        </div>
      ) : day.availableCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-sunken px-4 py-3 text-body-sm">
          <span>Nothing open on this day.</span>
          {nextOpenDay ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => onDate(nextOpenDay.dateKey)}>
              Next open day: {dayLabels(nextOpenDay, schedule.todayKey, tz).relative}{" "}
              {dayLabels(nextOpenDay, schedule.todayKey, tz).date}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4">
        {GROUPS.map((g) => {
          const slots = visible.filter((s) => g.test(localMinuteOfDay(new Date(s.startAt), tz)));
          if (slots.length === 0) return null;
          return (
            <fieldset key={g.id} className="min-w-0">
              <legend className="mb-2 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
                {g.label}
              </legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {slots.map((s) => (
                  <SlotChip
                    key={s.startAt}
                    slot={s}
                    tz={tz}
                    checked={selected === s.startAt}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </fieldset>
          );
        })}
        {hiddenPast > 0 ? (
          <p className="text-body-sm text-ink-subtle">Earlier times today have passed.</p>
        ) : null}
      </div>
    </div>
  );
}

function SlotChip({
  slot,
  tz,
  checked,
  onSelect,
}: {
  slot: SlotView;
  tz: string;
  checked: boolean;
  onSelect: (startAt: string) => void;
}) {
  const start = new Date(slot.startAt);
  const time = formatTime(start, tz);
  const available = slot.status === "AVAILABLE";
  const srDetail = available
    ? `${slot.isPeak ? "peak, " : ""}${formatINR(slot.totalAmount)}, ${slot.trainerCount} trainer${slot.trainerCount === 1 ? "" : "s"} free`
    : `unavailable: ${DISABLED_SR[slot.status as Exclude<SlotStatus, "AVAILABLE">]}`;
  return (
    <label
      className={cn(
        "relative grid cursor-pointer justify-items-center gap-0.5 rounded-md border px-2 py-2 text-center transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2",
        available && !checked && "border-hairline bg-raised hover:border-brand",
        checked && "border-brand bg-brand text-on-brand",
        !available && "cursor-not-allowed border-dashed border-hairline bg-transparent text-ink-subtle",
      )}
    >
      <input
        type="radio"
        name="slot"
        value={slot.startAt}
        checked={checked}
        disabled={!available}
        onChange={() => onSelect(slot.startAt)}
        className="sr-only"
      />
      <span className={cn("text-sm font-semibold tabular", !available && "line-through decoration-1")}>
        {time}
      </span>
      <span className="sr-only">, {srDetail}</span>
      <span
        aria-hidden
        className={cn(
          "text-[11px]",
          checked
            ? "text-on-brand/85"
            : available
              ? slot.isPeak
                ? "text-accent-text"
                : "text-ink-muted"
              : "",
        )}
      >
        {available
          ? slot.isPeak
            ? "Peak"
            : "Standard"
          : DISABLED_LABEL[slot.status as Exclude<SlotStatus, "AVAILABLE">]}
      </span>
    </label>
  );
}
