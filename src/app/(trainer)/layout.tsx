import { AppShell } from "@/components/layout/app-shell";
import { getActor, listPersonas } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const [actor, personas] = await Promise.all([getActor("TRAINER"), listPersonas("TRAINER")]);
  return (
    <AppShell role="TRAINER" personaName={actor.name} personaId={actor.userId} personas={personas}>
      {children}
    </AppShell>
  );
}
