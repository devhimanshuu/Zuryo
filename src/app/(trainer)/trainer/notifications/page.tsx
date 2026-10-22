import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ErrorState } from "@/components/shared/states";
import { MarkReadButton } from "@/features/notifications/mark-read-button";
import { NotificationList } from "@/features/notifications/notification-list";
import { getDb } from "@/lib/db";
import { parsePage } from "@/lib/pagination";
import { safely } from "@/lib/utils/errors";
import { getActor } from "@/server/auth/actor";
import { listNotifications, unreadCount } from "@/server/notifications/notification-service";

export const metadata: Metadata = { title: "Updates" };

export default async function TrainerNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await getActor("TRAINER");
  const { page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const result = await safely(async () => {
    const db = getDb();
    const [list, unread] = await Promise.all([
      listNotifications(db, actor.userId, page),
      unreadCount(db, actor.userId),
    ]);
    return { list, unread };
  });
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const { list, unread } = result.data;

  return (
    <div>
      <PageHeader
        title="Updates"
        description={`Notifications for ${actor.name}. ${unread ? `${unread} unread.` : "All caught up."}`}
        actions={<MarkReadButton as="TRAINER" disabled={unread === 0} />}
      />
      <NotificationList items={list.rows} bookingHref={(id) => `/trainer/sessions/${id}`} />
      <Pagination pathname="/trainer/notifications" result={list} itemLabel="updates" />
    </div>
  );
}
