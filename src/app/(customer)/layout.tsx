import { AppShell } from "@/components/layout/app-shell";
import { getActor, listPersonas } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [actor, personas] = await Promise.all([getActor("CUSTOMER"), listPersonas("CUSTOMER")]);
  return (
    <AppShell role="CUSTOMER" personaName={actor.name} personaId={actor.userId} personas={personas}>
      {children}
    </AppShell>
  );
}
