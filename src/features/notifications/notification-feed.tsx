"use client";

import {
  Ban,
  Bell,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCheck,
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
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  markCustomerNotificationReadAction,
  markCustomerNotificationsReadAction,
  markTrainerNotificationReadAction,
  markTrainerNotificationsReadAction,
} from "@/server/actions/notifications";

export type NotificationFeedItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  href?: string;
  when: string;
  dayKey: string;
  dayLabel: string;
  unread: boolean;
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

type OptimisticAction = { type: "one"; id: string } | { type: "all" };

function NotificationItem({
  item,
  disabled,
  onRead,
}: {
  item: NotificationFeedItem;
  disabled: boolean;
  onRead: (id: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const { Icon, tone } = ICON[item.type] ?? { Icon: Bell, tone: "bg-sunken text-ink-muted" };

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;
    start.current = { x: touch.clientX, y: touch.clientY };
    setDragging(true);
  }

  function onTouchMove(event: React.TouchEvent) {
    const touch = event.touches[0];
    if (!touch || !start.current) return;
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;
    if (Math.abs(dy) > Math.abs(dx)) return;
    setOffset(Math.max(-96, Math.min(0, dx)));
  }

  function onTouchEnd() {
    setDragging(false);
    if (offset < -56 && item.unread && !disabled) {
      suppressClick.current = true;
      onRead(item.id);
    }
    setOffset(0);
    start.current = null;
  }

  return (
    <li className="relative overflow-hidden">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0 flex w-24 items-center justify-center gap-1 bg-brand-soft text-xs font-semibold text-brand transition-opacity",
          offset < -8 ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="size-4" /> Read
      </span>
      <div
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        className={cn(
          "relative flex touch-pan-y gap-3.5 px-4 py-4 sm:px-5",
          item.unread &&
            "bg-brand-soft/30 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand",
          !dragging && "transition-transform duration-200 ease-(--ease-standard)",
        )}
      >
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", tone)} aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">
              {item.unread ? <span className="sr-only">Unread: </span> : null}
              {item.href ? (
                <Link href={item.href} className="hover:underline">
                  {item.title}
                </Link>
              ) : (
                item.title
              )}
            </p>
            {item.unread ? (
              <button
                type="button"
                onClick={() => onRead(item.id)}
                disabled={disabled}
                aria-label={`Mark “${item.title}” as read`}
                title="Mark as read"
                className="-mt-1 grid size-9 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-sunken hover:text-ink disabled:opacity-45 sm:size-7"
              >
                <Check className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="text-body-sm text-ink-muted">{item.message}</p>
          <p className="mt-0.5 text-body-sm text-ink-subtle">{item.when}</p>
        </div>
      </div>
    </li>
  );
}

function DayGroups({
  items,
  disabled,
  onRead,
}: {
  items: NotificationFeedItem[];
  disabled: boolean;
  onRead: (id: string) => void;
}) {
  const groups = new Map<string, { label: string; items: NotificationFeedItem[] }>();
  for (const item of items) {
    const group = groups.get(item.dayKey) ?? { label: item.dayLabel, items: [] };
    group.items.push(item);
    groups.set(item.dayKey, group);
  }
  return (
    <div className="grid gap-4">
      {[...groups.entries()].map(([key, group]) => (
        <section key={key} aria-label={group.label}>
          <h3 className="mb-1.5 pl-1 text-body-sm font-semibold text-ink-subtle">{group.label}</h3>
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-raised shadow-(--shadow-1)">
            {group.items.map((item) => (
              <NotificationItem key={item.id} item={item} disabled={disabled} onRead={onRead} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function NotificationFeed({
  items,
  variant,
}: {
  items: NotificationFeedItem[];
  variant: "CUSTOMER" | "TRAINER";
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, startTransition] = useTransition();
  const [optimisticItems, applyOptimistic] = useOptimistic(items, (state, action: OptimisticAction) =>
    action.type === "all"
      ? state.map((item) => ({ ...item, unread: false }))
      : state.map((item) => (item.id === action.id ? { ...item, unread: false } : item)),
  );
  const unread = optimisticItems.filter((item) => item.unread);
  const read = optimisticItems.filter((item) => !item.unread);
  const visible = filter === "unread" ? unread : optimisticItems;

  function markAll() {
    startTransition(async () => {
      applyOptimistic({ type: "all" });
      try {
        const action =
          variant === "TRAINER" ? markTrainerNotificationsReadAction : markCustomerNotificationsReadAction;
        const res = await action();
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        toast.success(res.data.marked > 0 ? "All updates marked as read" : "You're already all caught up");
        router.refresh();
      } catch {
        toast.error("We couldn't reach ZuryoFit. Check your connection and try again.");
      }
    });
  }

  function markOne(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "one", id });
      try {
        const action =
          variant === "TRAINER" ? markTrainerNotificationReadAction : markCustomerNotificationReadAction;
        const res = await action(id);
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        router.refresh();
      } catch {
        toast.error("We couldn't reach ZuryoFit. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Filter notifications"
          className="inline-flex items-center gap-0.5 rounded-md border border-hairline bg-raised p-0.5"
        >
          {[
            { value: "all", label: "All", count: optimisticItems.length },
            { value: "unread", label: "Unread", count: unread.length },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value as "all" | "unread")}
              aria-pressed={filter === option.value}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-body-sm font-semibold transition-colors",
                filter === option.value
                  ? "bg-surface text-ink shadow-(--shadow-1)"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
              <span className="text-xs text-ink-subtle tabular">{option.count}</span>
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={unread.length === 0}
          onClick={markAll}
        >
          {!pending ? <CheckCheck aria-hidden /> : null} Mark all as read
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-lg border border-dashed border-control/50 bg-raised px-5 py-10 text-center">
          <span
            className="mb-1 grid size-12 place-items-center rounded-full bg-brand-soft text-brand"
            aria-hidden
          >
            <CheckCheck className="size-5" />
          </span>
          <p className="font-semibold">You&apos;re all caught up</p>
          <p className="max-w-[40ch] text-body-sm text-ink-muted">
            New booking, payment and session updates will appear here.
          </p>
        </div>
      ) : (
        <>
          {unread.length > 0 ? (
            <section aria-labelledby="updates-new">
              <div className="mb-2.5 flex items-center gap-2">
                <h2 id="updates-new" className="text-body-sm font-semibold text-ink-muted">
                  New
                </h2>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand tabular">
                  {unread.length}
                </span>
                <span className="text-body-sm text-ink-subtle">Swipe left on a phone to mark read</span>
              </div>
              <DayGroups items={unread} disabled={pending} onRead={markOne} />
            </section>
          ) : null}

          {filter === "all" && read.length > 0 ? (
            <section aria-labelledby="updates-earlier">
              <h2 id="updates-earlier" className="mb-2.5 text-body-sm font-semibold text-ink-muted">
                Earlier
              </h2>
              <DayGroups items={read} disabled={pending} onRead={markOne} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
