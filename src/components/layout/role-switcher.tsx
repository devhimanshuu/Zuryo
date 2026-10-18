import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { ROLE_HOME, ROLES, type Role } from "@/lib/validation/enums";
import type { Persona } from "@/server/auth/actor";
import { NAV } from "./nav-config";
import { PersonaPicker } from "./persona-picker";

/**
 * Demo-only workspace and persona switcher. There is no sign-in yet, so this links between the three
 * seeded workspaces and lets you act as another seeded user. It is labelled as a demo control so
 * nobody mistakes it for authentication.
 */
export function RoleSwitcher({
  role,
  personaName,
  personaId,
  personas = [],
  onNavigate,
}: {
  role: Role;
  personaName: string;
  personaId?: string;
  personas?: Persona[];
  onNavigate?: () => void;
}) {
  return (
    <div className="rounded-md bg-sunken p-3">
      <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">Demo view</p>
      {personaId && personas.length > 1 ? (
        <PersonaPicker role={role} personas={personas} currentUserId={personaId} onSwitched={onNavigate} />
      ) : (
        <p className="mt-0.5 truncate text-sm font-semibold">{personaName}</p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-1" role="group" aria-label="Switch demo workspace">
        {ROLES.map((r) => (
          <Link
            key={r}
            href={ROLE_HOME[r]}
            onClick={onNavigate}
            aria-current={r === role ? "true" : undefined}
            className={cn(
              "rounded-sm px-1 py-1.5 text-center text-[11px] font-semibold text-ink-muted hover:bg-raised",
              r === role && "bg-raised text-ink shadow-(--shadow-1)",
            )}
          >
            {NAV[r].title === "Operations" ? "Ops" : NAV[r].title}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-subtle">Demo identity, not a real sign-in.</p>
    </div>
  );
}
