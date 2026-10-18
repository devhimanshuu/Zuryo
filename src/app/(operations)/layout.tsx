import { AppShell } from "@/components/layout/app-shell";
import { DEMO_PERSONAS } from "@/server/demo";

export const dynamic = "force-dynamic";

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="OPERATIONS" personaName={DEMO_PERSONAS.OPERATIONS.name}>
      {children}
    </AppShell>
  );
}
