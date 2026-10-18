import { AppShell } from "@/components/layout/app-shell";
import { DEMO_PERSONAS } from "@/server/demo";

export const dynamic = "force-dynamic";

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="TRAINER" personaName={DEMO_PERSONAS.TRAINER.name}>
      {children}
    </AppShell>
  );
}
