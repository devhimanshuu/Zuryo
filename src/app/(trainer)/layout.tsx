import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { UnreadBadge } from "@/features/notifications/unread-badge";
import { getActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor("TRAINER");
  // Streamed: the unread count never holds up the page itself.
  const unread = (
    <Suspense fallback={null}>
      <UnreadBadge userId={actor.userId} />
    </Suspense>
  );
  return (
    <AppShell role="TRAINER" accountName={actor.name} badges={{ "/trainer/notifications": unread }}>
      {children}
    </AppShell>
  );
}
