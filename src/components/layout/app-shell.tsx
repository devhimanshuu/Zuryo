import Link from "next/link";
import { Avatar } from "@/components/shared/avatar";
import { Wordmark } from "@/components/shared/wordmark";
import { Button } from "@/components/ui/button";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";
import { AccountPanel } from "./account-panel";
import { CommandPalette, CommandTrigger } from "./command-palette";
import { LiveRefresh } from "./live-refresh";
import { MobileNav } from "./mobile-nav";
import { NAV } from "./nav-config";
import { NavLinks, type NavBadges } from "./nav-links";
import { ThemeControl } from "./theme-control";

/**
 * Shared workspace frame for all three roles: sidebar on desktop, top bar + drawer on smaller
 * screens. Customers additionally get a bottom tab bar on phones, where they spend most time.
 */
export function AppShell({
  role,
  accountName,
  badges,
  children,
}: {
  role: Role;
  /** The signed-in user's name (from the session). */
  accountName: string;
  /** Extras beside nav links, keyed by href (e.g. a streamed unread count). */
  badges?: NavBadges;
  children: React.ReactNode;
}) {
  const home = ROLE_HOME[role];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-raised px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <LiveRefresh />
      <CommandPalette role={role} />

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-raised lg:flex">
        <SidebarContent role={role} accountName={accountName} badges={badges} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-hairline bg-surface/85 px-2 backdrop-blur-md lg:hidden">
          <MobileNav role={role}>
            <SidebarContent role={role} accountName={accountName} badges={badges} />
          </MobileNav>
          <Wordmark href={home} className="text-2xl" />
          <WorkspacePill role={role} className="hidden sm:inline-block" />
          <span className="ml-auto flex items-center gap-1">
            <CommandTrigger variant="icon" />
            <ThemeControl />
            <span className="pr-2" title={accountName}>
              <Avatar name={accountName} size="sm" />
            </span>
          </span>
        </header>
        <main
          id="main"
          className={cn("container-page py-6 lg:py-10", role === "CUSTOMER" && "pb-28 lg:pb-10")}
        >
          <div className="min-w-0 animate-rise">{children}</div>
        </main>
      </div>

      {role === "CUSTOMER" ? (
        <nav
          aria-label="Customer"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-raised/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(21_32_27/0.18)] backdrop-blur-md lg:hidden"
        >
          <NavLinks role={role} variant="tabs" badges={badges} />
        </nav>
      ) : null}
    </div>
  );
}

function WorkspacePill({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        "mt-0.5 rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-ink-muted uppercase",
        className,
      )}
    >
      {NAV[role].title}
    </span>
  );
}

/** Brand, pinned action, menu and account: the sidebar on desktop and the drawer on phones. */
function SidebarContent({
  role,
  accountName,
  badges,
}: {
  role: Role;
  accountName: string;
  badges?: NavBadges;
}) {
  const { cta } = NAV[role];
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <Wordmark href={ROLE_HOME[role]} />
        <WorkspacePill role={role} />
      </div>
      {cta ? (
        <div className="px-3 pt-2">
          <Button asChild variant="primary" className="w-full shadow-(--shadow-2)">
            <Link href={cta.href}>
              <cta.icon aria-hidden /> {cta.label}
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="px-3 pt-2">
        <CommandTrigger />
      </div>
      <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto px-3 pt-5">
        <p
          className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-subtle uppercase"
          aria-hidden
        >
          Menu
        </p>
        <NavLinks role={role} badges={badges} />
      </nav>
      <div className="shrink-0 p-3">
        <AccountPanel role={role} name={accountName} />
      </div>
    </>
  );
}
