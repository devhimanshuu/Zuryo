import { Wordmark } from "@/components/shared/wordmark";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";
import type { Persona } from "@/server/auth/actor";
import { MobileNav } from "./mobile-nav";
import { NAV } from "./nav-config";
import { NavLinks } from "./nav-links";
import { RoleSwitcher } from "./role-switcher";

/**
 * Shared workspace frame for all three roles: sidebar on desktop, top bar + drawer on smaller
 * screens. Customers additionally get a bottom tab bar on phones, where they spend most time.
 */
export function AppShell({
  role,
  personaName,
  personaId,
  personas,
  children,
}: {
  role: Role;
  personaName: string;
  /** The seeded user this workspace is acting as (demo identity). */
  personaId?: string;
  personas?: Persona[];
  children: React.ReactNode;
}) {
  const home = ROLE_HOME[role];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-raised px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-raised lg:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <Wordmark href={home} />
          <span className="mt-1 text-eyebrow font-semibold tracking-[0.08em] text-ink-subtle uppercase">
            {NAV[role].title}
          </span>
        </div>
        <nav aria-label="Workspace" className="flex-1 px-3 pt-2">
          <NavLinks role={role} />
        </nav>
        <div className="p-3">
          <RoleSwitcher role={role} personaName={personaName} personaId={personaId} personas={personas} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-hairline bg-surface/90 px-2 backdrop-blur lg:hidden">
          <MobileNav role={role} personaName={personaName} personaId={personaId} personas={personas} />
          <Wordmark href={home} className="text-2xl" />
          <span className="ml-auto pr-2 text-body-sm text-ink-muted">{NAV[role].title} demo</span>
        </header>
        <main
          id="main"
          className={cn("container-page py-6 lg:py-10", role === "CUSTOMER" && "pb-24 lg:pb-10")}
        >
          {children}
        </main>
      </div>

      {role === "CUSTOMER" ? (
        <nav
          aria-label="Customer"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <NavLinks role={role} variant="tabs" />
        </nav>
      ) : null}
    </div>
  );
}
