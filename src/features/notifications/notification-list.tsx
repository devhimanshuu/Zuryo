import {
  Ban,
  Bell,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  CreditCard,
  Hourglass,
  Package,
  Play,
  RotateCcw,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { cn } from "@/lib/utils/cn";
import { formatSlot } from "@/lib/utils/format";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  bookingId: string | null;
  packageId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const ICON: Record<string, { Icon: LucideIcon; tone: string }> = {
  BOOKING_ASSIGNED: { Icon: CalendarCheck, tone: "bg-brand-soft text-brand" },
  BOOKING_CANCELLED: { Icon: Ban, tone: "bg-sunken text-ink-muted" },
  BOOKING_RESCHEDULED: { Icon: CalendarClock, tone: "bg-info-soft text-info" },
  PAYMENT_SUCCEEDED: { Icon: CreditCard, tone: "bg-success-soft text-success" },
  PAYMENT_FAILED: { Icon: TriangleAlert, tone: "bg-danger-soft text-danger" },
  PACKAGE_PURCHASED: { Icon: Package, tone: "bg-success-soft text-success" },
  PACKAGE_SESSION_REDEEMED: { Icon: Package, tone: "bg-brand-soft text-brand" },
  PACKAGE_SESSION_RESTORED: { Icon: RotateCcw, tone: "bg-info-soft text-info" },
  SESSION_STARTING: { Icon: Timer, tone: "bg-accent-soft text-accent-text" },
  SESSION_STARTED: { Icon: Play, tone: "bg-accent-soft text-accent-text" },
  SESSION_WARNING: { Icon: Hourglass, tone: "bg-warning-soft text-warning" },
  SESSION_COMPLETED: { Icon: CircleCheck, tone: "bg-success-soft text-success" },
};

/** In-app notifications for one user, newest first; unread rows are marked with a dot and SR text. */
export function NotificationList({
  items,
  bookingHref,
  packageHref,
}: {
  items: NotificationRow[];
  bookingHref?: (bookingId: string) => string;
  packageHref?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No updates yet"
        body="Booking confirmations, payments, package changes and session updates appear here."
      />
    );
  }
  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-raised shadow-(--shadow-1)">
      {items.map((n) => {
        const { Icon, tone } = ICON[n.type] ?? { Icon: Bell, tone: "bg-sunken text-ink-muted" };
        const href = n.bookingId && bookingHref ? bookingHref(n.bookingId) : n.packageId ? packageHref : undefined;
        return (
          <li
            key={n.id}
            className={cn(
              "relative flex gap-3.5 px-4 py-4 sm:px-5",
              !n.readAt && "bg-brand-soft/30 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand",
            )}
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", tone)} aria-hidden>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {!n.readAt ? <span className="sr-only">Unread: </span> : null}
                {href ? (
                  <Link href={href} className="hover:underline">
                    {n.title}
                  </Link>
                ) : (
                  n.title
                )}
              </p>
              <p className="text-body-sm text-ink-muted">{n.message}</p>
              <p className="mt-0.5 text-body-sm text-ink-subtle">{formatSlot(n.createdAt)}</p>
            </div>
            {!n.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-hidden /> : null}
          </li>
        );
      })}
    </ul>
  );
}
