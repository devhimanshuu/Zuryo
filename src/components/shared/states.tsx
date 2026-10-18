import { CalendarDays, CircleAlert, Construction, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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
        "grid justify-items-center gap-2 rounded-lg border border-dashed border-control bg-raised px-5 py-10 text-center",
        className,
      )}
    >
      <span
        className="mb-1 grid size-12 place-items-center rounded-full bg-sunken text-ink-muted"
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
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
      className="flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-danger"
    >
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
