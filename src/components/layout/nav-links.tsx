"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { NAV, isActive } from "./nav-config";

export function NavLinks({
  role,
  onNavigate,
  variant = "sidebar",
}: {
  role: Role;
  onNavigate?: () => void;
  variant?: "sidebar" | "tabs";
}) {
  const pathname = usePathname();
  const home = ROLE_HOME[role];
  return (
    <ul className={cn(variant === "sidebar" ? "grid gap-0.5" : "flex justify-around")}>
      {NAV[role].items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href, home);
        return (
          <li key={href} className={variant === "tabs" ? "flex-1" : undefined}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                variant === "sidebar" &&
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink",
                variant === "sidebar" &&
                  active &&
                  "bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand",
                variant === "tabs" &&
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-subtle",
                variant === "tabs" && active && "text-brand",
              )}
            >
              <Icon className="size-5" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
