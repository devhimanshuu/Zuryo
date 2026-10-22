import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ErrorState } from "@/components/shared/states";
import { NotificationList } from "@/features/notifications/notification-list";
import { getDb } from "@/lib/db";
import { parsePage } from "@/lib/pagination";
import { safely } from "@/lib/utils/errors";
import { getActor } from "@/server/auth/actor";
import { listNotifications, unreadCount } from "@/server/notifications/notification-service";

export const metadata: Metadata = { title: "Updates" };

export default async function CustomerNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await getActor("CUSTOMER");
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
        editorial
        title="Updates"
        description={`In-app notifications for ${actor.name}. ${unread ? `${unread} unread.` : "All caught up."}`}
      />
      <NotificationList
        items={list.rows}
        variant="CUSTOMER"
        packageHref="/customer/packages"
      />
      <Pagination pathname="/customer/notifications" result={list} itemLabel="updates" />
    </div>
  );
}
