import { Ban, Check, CircleCheck, Hourglass, TriangleAlert } from "lucide-react";
import type { BookingStatus } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";

const STATUS: Record<BookingStatus, { label: string; className: string; Icon: typeof Check | null }> = {
  PENDING: { label: "Pending", className: "bg-warning-soft text-warning", Icon: Hourglass },
  CONFIRMED: { label: "Confirmed", className: "bg-brand-soft text-brand", Icon: CircleCheck },
  IN_PROGRESS: { label: "In progress", className: "bg-accent-soft text-accent-text", Icon: null },
  COMPLETED: { label: "Completed", className: "bg-success-soft text-success", Icon: Check },
  CANCELLED: { label: "Cancelled", className: "bg-sunken text-ink-muted", Icon: Ban },
  FAILED: { label: "Failed", className: "bg-danger-soft text-danger", Icon: TriangleAlert },
};

/** Booking state as icon + word + tint, so status never depends on colour alone. */
export function StatusBadge({ status, rescheduled }: { status: BookingStatus; rescheduled?: boolean }) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap",
        s.className,
      )}
    >
      {s.Icon ? (
        <s.Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      ) : (
        <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
      )}
      {s.label}
      {rescheduled && status === "CONFIRMED" ? <span className="font-normal">· rescheduled</span> : null}
    </span>
  );
}
