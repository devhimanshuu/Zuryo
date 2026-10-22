"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { sparklinePaths, type TrendPoint } from "@/lib/trend";
import { cn } from "@/lib/utils/cn";

/**
 * Sparkline with a per-day hover/focus readout and an optional comparison against the previous
 * period. The visible SVG is decorative; every day is also reachable as a labelled, focusable
 * column, and the caption states the total.
 */
export function TrendChart({
  points,
  label,
  total,
  currency = false,
  valueNoun = "entry",
  previousTotal,
  className,
}: {
  points: TrendPoint[];
  label: string;
  total: string;
  currency?: boolean;
  valueNoun?: string;
  previousTotal?: number;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return null;
  const { line, area } = sparklinePaths(points.map((p) => p.value));
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? 0) ? i : best), 0);
  const sum = points.reduce((n, p) => n + p.value, 0);
  const hasPeak = (points[peak]?.value ?? 0) > 0;
  const topPercent = (value: number) => ((32 - 3 - (Math.max(0, value) / max) * 26) / 32) * 100;
  const noun = (value: number) => `${value.toLocaleString("en-IN")} ${valueNoun}${value === 1 ? "" : "s"}`;
  const format = (value: number) => (currency ? formatINR(value.toFixed(2)) : noun(value));

  const delta = previousTotal === undefined ? null : sum - previousTotal;
  const percent =
    previousTotal && previousTotal > 0 ? Math.round((Math.abs(delta ?? 0) / previousTotal) * 100) : null;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <figure className={cn("grid gap-2", className)}>
      <figcaption className="sr-only">
        {label}: {total} over the last {points.length} days.
        {previousTotal !== undefined ? ` Previous period: ${format(previousTotal)}.` : ""}
      </figcaption>

      <div className="relative h-16">
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full text-brand"
          aria-hidden
        >
          <path d={area} fill="currentColor" opacity="0.12" />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        <div className="absolute inset-0 flex">
          {points.map((point, i) => {
            const top = topPercent(point.value);
            const isActive = active === i;
            return (
              <div key={point.dateKey} className="relative flex-1">
                <button
                  type="button"
                  className="absolute inset-0 rounded-sm focus-visible:outline-offset-0"
                  aria-label={`${point.label}: ${format(point.value)}${i === peak && hasPeak ? " (peak)" : ""}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand transition-[transform,opacity] duration-150",
                    isActive ? "scale-150 opacity-100" : "opacity-0",
                    i === peak && hasPeak && !isActive && "opacity-100",
                  )}
                  style={{ top: `${top}%` }}
                />
                {isActive ? (
                  <span
                    className={cn(
                      "pointer-events-none absolute z-10 w-max rounded-md border border-hairline bg-raised px-2.5 py-1.5 text-body-sm shadow-(--shadow-2)",
                      i === 0 ? "left-0" : i === points.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                    style={{ bottom: `calc(100% - ${top}% + 8px)` }}
                  >
                    <span className="block text-xs font-semibold text-ink-subtle">{point.label}</span>
                    <span className="font-semibold tabular">{format(point.value)}</span>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 text-body-sm text-ink-muted">
        <span className="tabular">{points[0]?.label}</span>
        <span className="font-semibold text-ink">{total}</span>
        <span className="tabular">{points.at(-1)?.label}</span>
      </div>

      {delta !== null ? (
        <p
          className={cn(
            "flex items-center gap-1 text-body-sm",
            delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-ink-muted",
          )}
          title={`${format(sum)} this period, ${format(previousTotal ?? 0)} in the previous period`}
        >
          <DeltaIcon className="size-3.5" aria-hidden />
          <span className="font-semibold tabular">
            {delta === 0
              ? "No change"
              : `${delta > 0 ? "+" : "−"}${format(Math.abs(delta))}${percent !== null ? ` (${percent}%)` : ""}`}
          </span>
          <span className="text-ink-muted">vs previous {points.length} days</span>
        </p>
      ) : null}
    </figure>
  );
}
