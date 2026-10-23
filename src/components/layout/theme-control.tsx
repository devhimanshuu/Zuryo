"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { parseThemeChoice, resolveDark, THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

const OPTIONS = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "dark", label: "Dark theme", Icon: Moon },
] as const;

const CHANGE_EVENT = "zuryofit-theme-change";

function storedChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const dark = resolveDark(choice, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101814" : "#f6f4ef");
}

/** Three-way theme control: follow the system by default, or pin light/dark. */
export function ThemeControl() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const sync = () => setChoice(storedChoice());
    sync();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (storedChoice() === "system") apply("system");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      apply(storedChoice());
      sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, sync);
    media.addEventListener("change", onMedia);
    return () => {
      window.removeEventListener("change", onMedia);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, sync);
      media.removeEventListener("change", onMedia);
    };
  }, []);

  function select(next: ThemeChoice) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable in private modes; the class still applies for this page.
    }
    setChoice(next);
    apply(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-hairline bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => select(value)}
          aria-label={label}
          aria-pressed={choice === value}
          title={label}
          className={cn(
            "grid size-9 place-items-center rounded-sm text-ink-muted transition-colors hover:text-ink sm:size-7",
            choice === value && "bg-raised text-ink shadow-(--shadow-1)",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
