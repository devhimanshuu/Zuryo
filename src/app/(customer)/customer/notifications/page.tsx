import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { MarkReadButton } from "@/features/notifications/mark-read-button";
import { NotificationList } from "@/features/notifications/notification-list";
import { getDb } from "@/lib/db";
import { safely } from "@/lib/utils/errors";
import { getActor } from "@/server/auth/actor";
import { listNotifications } from "@/server/notifications/notification-service";

export const metadata: Metadata = { title: "Updates" };

export default async function CustomerNotificationsPage() {
  const actor = await getActor("CUSTOMER");
  const result = await safely(() => listNotifications(getDb(), actor.userId));
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const unread = result.data.filter((n) => !n.readAt).length;

  return (
    <div>
      <PageHeader
        editorial
        title="Updates"
        description={`In-app notifications for ${actor.name}. ${unread ? `${unread} unread.` : "All caught up."}`}
        actions={<MarkReadButton as="CUSTOMER" disabled={unread === 0} />}
      />
      <NotificationList
        items={result.data}
        bookingHref={(id) => `/customer/bookings/${id}`}
        packageHref="/customer/packages"
      />
    </div>
  );
}
