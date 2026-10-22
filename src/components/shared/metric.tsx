import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TONE = {
  brand: "bg-brand-soft text-brand",
  accent: "bg-accent-soft text-accent-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  muted: "bg-sunken text-ink-muted",
} as const;

export function Metric({
  label,
  value,
  foot,
  alert,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  alert?: boolean;
  /** Optional icon tile in the corner; decorative, the label carries the meaning. */
  icon?: LucideIcon;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-raised px-5 py-4 shadow-(--shadow-1)">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1 text-body-sm font-semibold text-ink-muted">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md",
              TONE[alert ? "warning" : tone],
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className={cn("mt-1 text-numeric-lg font-semibold tracking-tight tabular", alert && "text-warning")}>
        {value}
      </p>
      {foot ? <p className="mt-1 text-body-sm text-ink-muted">{foot}</p> : null}
    </div>
  );
}
