import { AppShell } from "@/components/layout/app-shell";
import { getActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor("TRAINER");
  return (
    <AppShell role="TRAINER" accountName={actor.name}>
      {children}
    </AppShell>
  );
}
