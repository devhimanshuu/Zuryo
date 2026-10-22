"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { NAV, isActive } from "./nav-config";

/** Per-href extras rendered beside a link, e.g. a streamed unread count on "Updates". */
export type NavBadges = Partial<Record<string, React.ReactNode>>;

export function NavLinks({
  role,
  onNavigate,
  badges,
  variant = "sidebar",
}: {
  role: Role;
  onNavigate?: () => void;
  badges?: NavBadges;
  variant?: "sidebar" | "tabs";
}) {
  const pathname = usePathname();
  const home = ROLE_HOME[role];
  return (
    <ul className={cn(variant === "sidebar" ? "grid gap-0.5" : "flex justify-around")}>
      {NAV[role].items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href, home);
        const badge = badges?.[href];
        return (
          <li key={href} className={variant === "tabs" ? "flex-1" : undefined}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                variant === "sidebar" &&
                  "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink",
                variant === "sidebar" &&
                  active &&
                  "bg-brand-soft text-brand before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-brand hover:bg-brand-soft hover:text-brand",
                variant === "tabs" &&
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-subtle transition-colors",
                variant === "tabs" && active && "text-brand",
              )}
            >
              {variant === "tabs" ? (
                <span
                  className={cn(
                    "relative grid h-7 w-12 place-items-center rounded-full transition-colors duration-200",
                    active && "bg-brand-soft",
                  )}
                >
                  <Icon className="size-5" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                  {badge ? <span className="absolute -top-1 right-0.5">{badge}</span> : null}
                </span>
              ) : (
                <Icon className="size-[18px] shrink-0" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
              )}
              {label}
              {variant === "sidebar" && badge ? <span className="ml-auto">{badge}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
