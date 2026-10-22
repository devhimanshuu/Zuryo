import "server-only";
import type { NotificationType } from "@prisma/client";
import { PAGE_SIZES, paginateRows } from "@/lib/pagination";
import type { DbOrTx } from "@/server/booking/deps";

export type NewNotification = {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: string | null;
  packageId?: string | null;
  paymentId?: string | null;
  /**
   * Stable key for an event, e.g. `session-warning:<bookingId>:<recipientId>`. With a key the insert
   * is ON CONFLICT DO NOTHING, so retries, concurrent requests and repeated reconciliation can never
   * notify twice.
   */
  dedupeKey?: string;
};

/** Writes notifications in the caller's transaction. Returns how many were actually created. */
export async function notify(db: DbOrTx, items: NewNotification[]): Promise<number> {
  if (items.length === 0) return 0;
  const res = await db.notification.createMany({ data: items, skipDuplicates: true });
  return res.count;
}

/** A user's own notifications, newest first, one page at a time. Recipients only read their rows. */
export async function listNotifications(db: DbOrTx, userId: string, page = 1) {
  return paginateRows({
    page,
    pageSize: PAGE_SIZES.notifications,
    count: () => db.notification.count({ where: { recipientId: userId } }),
    rows: (skip, take) =>
      db.notification.findMany({
        where: { recipientId: userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          bookingId: true,
          packageId: true,
          readAt: true,
          createdAt: true,
        },
      }),
  });
}

export async function unreadCount(db: DbOrTx, userId: string): Promise<number> {
  return db.notification.count({ where: { recipientId: userId, readAt: null } });
}

export async function markAllRead(db: DbOrTx, userId: string, now: Date): Promise<number> {
  const res = await db.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: now },
  });
  return res.count;
}
