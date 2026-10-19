import { Ban, CircleCheck, Clock, Hourglass, PackageX } from "lucide-react";
import type { PackageStatusValue } from "@/lib/packages/packages";
import { cn } from "@/lib/utils/cn";

const STATUS: Record<PackageStatusValue, { label: string; className: string; Icon: typeof Clock }> = {
  ACTIVE: { label: "Active", className: "bg-success-soft text-success", Icon: CircleCheck },
  EXHAUSTED: { label: "All sessions used", className: "bg-sunken text-ink-muted", Icon: PackageX },
  EXPIRED: { label: "Expired", className: "bg-sunken text-ink-muted", Icon: Clock },
  CANCELLED: { label: "Discarded", className: "bg-sunken text-ink-muted", Icon: Ban },
  PENDING_PAYMENT: { label: "Awaiting payment", className: "bg-warning-soft text-warning", Icon: Hourglass },
};

export function PackageStatusBadge({ status }: { status: PackageStatusValue }) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap",
        s.className,
      )}
    >
      <s.Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      {s.label}
    </span>
  );
}
