import { Check, Circle, Layers, X } from "lucide-react";
import { formatTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { BookingStatus } from "@/lib/validation/enums";

const STEPS = ["Booked", "Confirmed", "In progress", "Completed"] as const;

function stage(status: BookingStatus) {
  switch (status) {
    case "PENDING":
      return { current: 1, halted: false };
    case "CONFIRMED":
      return { current: 1, halted: false };
    case "IN_PROGRESS":
      return { current: 2, halted: false };
    case "COMPLETED":
      return { current: 3, halted: false };
    default:
      return { current: 1, halted: true };
  }
}

function nextStep(status: BookingStatus, startAt: Date, endAt?: Date) {
  switch (status) {
    case "PENDING":
      return "Complete payment to confirm this session.";
    case "CONFIRMED":
      return "Next: your trainer is assigned. Reschedule or cancel from this page if plans change.";
    case "IN_PROGRESS":
      return `Next: finish the session (scheduled to end at ${formatTime(endAt ?? new Date(startAt.getTime() + 60 * 60 * 1000))}). Your trainer records the summary.`;
    case "COMPLETED":
      return "Next: review the session summary and leave feedback for your trainer.";
    case "FAILED":
      return "Payment failed, so no session was booked. You can book another slot.";
    default:
      return "This booking was cancelled. Your package session is restored when the policy allows.";
  }
}

/** Horizontal lifecycle: Booked → Confirmed → In progress → Completed, with a clear next step. */
export function BookingTimeline({
  status,
  startAt,
  endAt,
  className,
}: {
  status: BookingStatus;
  startAt: Date;
  endAt?: Date;
  className?: string;
}) {
  const { current, halted } = stage(status);
  return (
    <section
      aria-label="Booking progress"
      className={cn("rounded-lg border border-hairline bg-raised px-4 py-4 shadow-(--shadow-1) sm:px-5", className)}
    >
      <ol className="grid grid-cols-4">
        {STEPS.map((label, i) => {
          const done = i < current || status === "COMPLETED";
          const active = i === current && status !== "COMPLETED";
          const stop = halted && i === current;
          return (
            <li
              key={label}
              aria-current={active || stop ? "step" : undefined}
              className="relative flex flex-col items-center gap-1.5 text-center"
            >
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2",
                    i <= current ? "bg-brand" : "bg-hairline",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 grid size-6 place-items-center rounded-full border-2",
                  stop
                    ? "border-danger bg-danger-soft text-danger"
                    : done
                      ? "border-brand bg-brand text-on-brand"
                      : active
                        ? "border-brand bg-raised text-brand"
                        : "border-hairline bg-surface text-ink-subtle",
                )}
                aria-hidden
              >
                {stop ? (
                  <X className="size-3" />
                ) : done ? (
                  <Check className="size-3" />
                ) : active ? (
                  <Circle className="size-2 fill-current" />
                ) : (
                  <Circle className="size-1.5 fill-current" />
                )}
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold sm:text-xs",
                  stop ? "text-danger" : done || active ? "text-ink" : "text-ink-subtle",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p
        className={cn(
          "mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-body-sm",
          halted ? "bg-danger-soft text-danger" : "bg-brand-soft/60 text-brand-strong",
        )}
      >
        <Layers className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{nextStep(status, startAt, endAt)}</span>
      </p>
    </section>
  );
}
