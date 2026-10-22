import { Bell } from "lucide-react";
import { EmptyState } from "@/components/shared/states";
import { formatSlot } from "@/lib/utils/format";
import type { NotificationFeedItem } from "./notification-feed";
import { NotificationFeed } from "./notification-feed";

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

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date, now: Date) {
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** In-app notifications for one user, newest first; unread rows are grouped under New. */
export function NotificationList({
  items,
  variant,
  packageHref,
}: {
  items: NotificationRow[];
  variant: "CUSTOMER" | "TRAINER";
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

  const now = new Date();
  const feed: NotificationFeedItem[] = items.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    href: n.bookingId
      ? variant === "CUSTOMER"
        ? `/customer/bookings/${n.bookingId}`
        : `/trainer/sessions/${n.bookingId}`
      : n.packageId
        ? packageHref
        : undefined,
    when: formatSlot(n.createdAt),
    dayKey: dayKey(n.createdAt),
    dayLabel: dayLabel(n.createdAt, now),
    unread: n.readAt === null,
  }));

  return <NotificationFeed items={feed} variant={variant} />;
}
