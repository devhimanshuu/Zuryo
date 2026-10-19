import { AppShell } from "@/components/layout/app-shell";
import { getActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor("CUSTOMER");
  return (
    <AppShell role="CUSTOMER" accountName={actor.name}>
      {children}
    </AppShell>
  );
}
