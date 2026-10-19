import { AppShell } from "@/components/layout/app-shell";
import { getActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor("OPERATIONS");
  return (
    <AppShell role="OPERATIONS" accountName={actor.name}>
      {children}
    </AppShell>
  );
}
