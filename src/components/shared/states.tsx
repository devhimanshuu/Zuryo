import {
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Construction,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SpotIllustration } from "./spot-illustration";

const NOTICE = {
  info: { className: "bg-info-soft text-info", Icon: Info },
  success: { className: "bg-success-soft text-success", Icon: CircleCheck },
  warning: { className: "bg-warning-soft text-warning", Icon: TriangleAlert },
  danger: { className: "border border-danger/30 bg-danger-soft text-danger", Icon: CircleAlert },
} as const;

/** Inline message with icon + text, so meaning never depends on colour alone. */
export function Notice({
  tone = "info",
  title,
  children,
  className,
  live,
}: {
  tone?: keyof typeof NOTICE;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  /** Announce to screen readers when it appears (errors use role="alert"). */
  live?: boolean;
}) {
  const { className: toneClass, Icon } = NOTICE[tone];
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cn("flex gap-3 rounded-md px-3.5 py-3 text-body-sm", toneClass, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon = CalendarDays,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate grid justify-items-center gap-2 overflow-hidden rounded-lg border border-dashed border-control/50 bg-raised px-5 py-10 text-center",
        className,
      )}
    >
      <div aria-hidden className="bg-dot-grid fade-radial pointer-events-none absolute inset-0 -z-10 text-brand/15" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 size-52 -translate-x-1/2 rounded-full bg-brand-soft/60 blur-3xl"
      />
      <div className="relative mb-2 h-24 w-40" aria-hidden>
        <SpotIllustration className="h-full w-full" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-10 place-items-center rounded-full bg-raised/90 text-brand shadow-(--shadow-1) ring-4 ring-brand-soft/60 backdrop-blur-sm">
            <Icon className="size-5" />
          </span>
        </span>
      </div>
      <h3 className="text-heading-md font-semibold">{title}</h3>
      {body ? <p className="max-w-[44ch] text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load this page",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div
      role="alert"
      className="relative isolate flex gap-3 overflow-hidden rounded-lg border border-danger/30 bg-danger-soft p-4 text-danger"
    >
      <SpotIllustration
        variant="error"
        className="pointer-events-none absolute -right-5 -bottom-7 -z-10 h-28 w-40 opacity-30"
      />
      <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-body-sm">{message}</p>
      </div>
    </div>
  );
}

/** Honest marker for functionality that a later phase delivers. */
export function PhaseNote({ phase, children }: { phase?: number; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-body-sm text-info">
      <Construction className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">{phase ? `Phase ${phase}:` : "Planned:"}</strong> {children}
      </span>
    </p>
  );
}
