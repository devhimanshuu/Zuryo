import { AppShell } from "@/components/layout/app-shell";
import { getActor, listPersonas } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const [actor, personas] = await Promise.all([getActor("OPERATIONS"), listPersonas("OPERATIONS")]);
  return (
    <AppShell role="OPERATIONS" personaName={actor.name} personaId={actor.userId} personas={personas}>
      {children}
    </AppShell>
  );
}
