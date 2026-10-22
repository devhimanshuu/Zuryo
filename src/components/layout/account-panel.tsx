import { Avatar } from "@/components/shared/avatar";
import type { Role } from "@/lib/validation/enums";
import { NAV } from "./nav-config";
import { SignOutButton } from "./sign-out-button";
import { ThemeControl } from "./theme-control";

/** Who is signed in and where they are. Identity comes from the NextAuth session. */
export function AccountPanel({ role, name }: { role: Role; name: string }) {
  return (
    <div className="grid gap-2.5 rounded-md border border-hairline bg-surface/60 p-2.5">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-subtle uppercase">Signed in as</p>
          <p className="truncate text-sm font-semibold" title={`${name} — ${NAV[role].title} workspace`}>
            {name}
          </p>
        </div>
        <SignOutButton />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-subtle uppercase">Theme</span>
        <ThemeControl />
      </div>
    </div>
  );
}
