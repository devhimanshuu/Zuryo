"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

const STORAGE_KEY = "zuryo:sidebar-collapsed";

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

/**
 * Outer grid of the workspace. Owns the desktop sidebar's collapsed state (remembered per browser)
 * and exposes it as `data-collapsed`, so server-rendered sidebar children can restyle with
 * `lg:group-data-[collapsed=true]/shell:` variants instead of becoming client components.
 */
export function ShellFrame({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // Hydrate the saved preference after mount, so server and first client render match.
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage unavailable: stay expanded */
    }
  }, []);

  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* preference just won't persist */
      }
      return next;
    });

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div
        data-collapsed={collapsed}
        className={cn(
          "group/shell min-h-dvh lg:grid lg:transition-[grid-template-columns] lg:duration-200",
          collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[264px_1fr]",
        )}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useContext(SidebarContext);
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "hidden size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink lg:grid",
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
