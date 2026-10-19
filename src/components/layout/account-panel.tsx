import type { Role } from "@/lib/validation/enums";
import { NAV } from "./nav-config";
import { SignOutButton } from "./sign-out-button";

/** Who is signed in and where they are. Identity comes from the NextAuth session. */
export function AccountPanel({ role, name }: { role: Role; name: string }) {
  return (
    <div className="rounded-md bg-sunken p-3">
      <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">Signed in as</p>
      <p className="mt-0.5 truncate text-sm font-semibold" title={name}>
        {name}
      </p>
      <p className="text-[11px] text-ink-subtle">{NAV[role].title} workspace</p>
      <SignOutButton />
    </div>
  );
}
