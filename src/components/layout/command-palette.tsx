"use client";

import { CalendarClock, Download, Hourglass, Search, Zap, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Role } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";
import { NAV } from "./nav-config";

const OPEN_EVENT = "zuryo:command-palette";

type Command = {
  href: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: LucideIcon;
  group: string;
};

const EXTRA: Record<Role, Command[]> = {
  CUSTOMER: [
    {
      href: "/customer/bookings/new?mode=instant",
      label: "Book an instant session",
      hint: "A trainer within the hour",
      keywords: "now quick",
      icon: Zap,
      group: "Actions",
    },
    {
      href: "/customer/bookings/new?mode=scheduled",
      label: "Schedule a session",
      hint: "Pick a day and time",
      keywords: "later calendar",
      icon: CalendarClock,
      group: "Actions",
    },
  ],
  TRAINER: [
    {
      href: "/trainer/sessions?tab=completed",
      label: "Review completed sessions",
      hint: "Notes and history",
      keywords: "past notes",
      icon: Hourglass,
      group: "Actions",
    },
  ],
  OPERATIONS: [
    {
      href: "/operations/bookings?status=PENDING",
      label: "Review pending bookings",
      hint: "Needs attention",
      keywords: "unassigned waiting",
      icon: Hourglass,
      group: "Actions",
    },
    {
      href: "/operations/bookings/export",
      label: "Export bookings CSV",
      hint: "Current filters",
      keywords: "download spreadsheet",
      icon: Download,
      group: "Actions",
    },
  ],
};

function commandsFor(role: Role): Command[] {
  return [
    ...NAV[role].items.map((item) => ({
      href: item.href,
      label: item.label,
      keywords: item.label.toLowerCase(),
      icon: item.icon,
      group: "Pages",
    })),
    ...EXTRA[role],
  ];
}

/** Global Cmd/Ctrl+K palette for pages and role-specific actions. */
export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const commands = useMemo(() => commandsFor(role), [role]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase().includes(needle))
    : commands;

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  function run(command: Command) {
    setOpen(false);
    setQuery("");
    router.push(command.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered[active];
      if (command) run(command);
    }
  }

  const groups = [...new Set(filtered.map((c) => c.group))];
  let index = -1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[10%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search Zuryo</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages and actions. Use the arrow keys and Enter.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b border-hairline pr-14 pl-4">
          <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages and actions…"
            aria-label="Search pages and actions"
            role="combobox"
            aria-expanded
            aria-controls="command-results"
            aria-activedescendant={filtered[active] ? `command-${active}` : undefined}
            className="h-12 w-full bg-transparent text-body-md outline-none placeholder:text-ink-subtle"
          />
          <kbd className="hidden shrink-0 rounded border border-hairline px-1.5 py-0.5 text-[10px] font-semibold text-ink-subtle sm:block">
            Esc
          </kbd>
        </div>
        <div
          id="command-results"
          role="listbox"
          aria-label="Results"
          className="max-h-[min(60vh,26rem)] overflow-y-auto p-2"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-body-sm text-ink-muted">
              Nothing matches “{query.trim()}”. Try “bookings” or “availability”.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-ink-subtle uppercase">
                  {group}
                </p>
                {filtered
                  .filter((command) => command.group === group)
                  .map((command) => {
                    index += 1;
                    const itemIndex = index;
                    const Icon = command.icon;
                    return (
                      <button
                        key={`${command.group}-${command.href}-${command.label}`}
                        id={`command-${itemIndex}`}
                        type="button"
                        role="option"
                        aria-selected={itemIndex === active}
                        onMouseEnter={() => setActive(itemIndex)}
                        onClick={() => run(command)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left",
                          itemIndex === active ? "bg-sunken text-ink" : "text-ink-muted hover:bg-sunken",
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-body-sm font-semibold">
                          {command.label}
                        </span>
                        {command.hint ? (
                          <span className="hidden shrink-0 text-body-sm text-ink-subtle sm:block">
                            {command.hint}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2 text-body-sm text-ink-subtle">
          <span>↑ ↓ to move · Enter to open</span>
          <span>Ctrl K to toggle</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small trigger used in the sidebar and the mobile header. */
export function CommandTrigger({ variant = "sidebar" }: { variant?: "sidebar" | "icon" }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={cn(
        variant === "sidebar"
          ? "flex w-full items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2 text-left text-body-sm text-ink-muted transition-colors hover:border-control hover:text-ink lg:group-data-[collapsed=true]/shell:justify-center lg:group-data-[collapsed=true]/shell:px-0"
          : "grid size-10 place-items-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink",
      )}
      aria-label="Search pages and actions (Ctrl K)"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      {variant === "sidebar" ? (
        <>
          <span className="flex-1 lg:group-data-[collapsed=true]/shell:hidden">Search</span>
          <kbd className="rounded border border-hairline px-1.5 py-0.5 text-[10px] font-semibold lg:group-data-[collapsed=true]/shell:hidden">
            Ctrl K
          </kbd>
        </>
      ) : null}
    </button>
  );
}
