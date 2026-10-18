import { AppShell } from "@/components/layout/app-shell";
import { DEMO_PERSONAS } from "@/server/demo";

export const dynamic = "force-dynamic";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="CUSTOMER" personaName={DEMO_PERSONAS.CUSTOMER.name}>
      {children}
    </AppShell>
  );
}
