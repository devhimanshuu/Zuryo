import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { unreadCount } from "@/server/notifications/notification-service";

/** One count per request, however many nav surfaces (sidebar, drawer, tab bar) show the badge. */
const countFor = cache(async (userId: string) => {
  try {
    return await unreadCount(getDb(), userId);
  } catch {
    // A missing badge is better than a broken navigation shell.
    return 0;
  }
});

/** Unread notification count for nav links. Render inside <Suspense> so it never blocks the page. */
export async function UnreadBadge({ userId }: { userId: string }) {
  const n = await countFor(userId);
  if (n === 0) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] leading-none font-semibold text-on-accent tabular">
      {n > 99 ? "99+" : n}
      <span className="sr-only"> unread</span>
    </span>
  );
}
