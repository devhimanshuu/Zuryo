"use client";

import { Bookmark, Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type FilterSelect = {
  name: string;
  label: string;
  defaultValue: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

type SavedView = { name: string; query: string; savedAt: string };

const MAX_SAVED_VIEWS = 8;

function readViews(key: string): SavedView[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as SavedView).name === "string" &&
        typeof (v as SavedView).query === "string",
    );
  } catch {
    return [];
  }
}

/**
 * URL-synced filter bar for operations lists: debounced search, auto-applied selects and a clear
 * action. Every state is bookmarkable; filtering always resets to page 1.
 */
export function OperationsFilterBar({
  searchPlaceholder,
  defaultQuery = "",
  selects = [],
  onPendingChange,
}: {
  searchPlaceholder: string;
  defaultQuery?: string;
  selects?: FilterSelect[];
  /** Lets the surrounding shell dim stale results while a filtered navigation is in flight. */
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(defaultQuery);
  const timer = useRef<number | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewError, setViewError] = useState<string | null>(null);
  const storageKey = `zuryo-ops-views:${pathname}`;

  useEffect(() => {
    setViews(readViews(storageKey));
  }, [storageKey]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  function navigate(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function applyQuery(next: URLSearchParams, value: string) {
    const trimmed = value.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      navigate((next) => applyQuery(next, value));
    }, 350);
  }

  const hasFilters = Boolean(params.get("q")) || selects.some((s) => params.get(s.name));

  function currentQuery() {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    return next.toString();
  }

  function saveView(event: React.FormEvent) {
    event.preventDefault();
    const name = viewName.trim();
    if (!name) {
      setViewError("Give this view a name.");
      return;
    }
    const next = [
      ...views.filter((v) => v.name.toLowerCase() !== name.toLowerCase()),
      { name, query: currentQuery(), savedAt: new Date().toISOString() },
    ].slice(-MAX_SAVED_VIEWS);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setViews(next);
      setViewName("");
      setViewError(null);
      setViewsOpen(false);
      toast.success(`View "${name}" saved`);
    } catch {
      setViewError("This browser won't let us save views. Try allowing site storage.");
    }
  }

  function applyView(view: SavedView) {
    setViewsOpen(false);
    startTransition(() =>
      router.replace(view.query ? `${pathname}?${view.query}` : pathname, { scroll: false }),
    );
  }

  function deleteView(name: string) {
    const next = views.filter((v) => v.name !== name);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setViews(next);
    } catch {
      toast.error("We couldn't update saved views in this browser.");
    }
  }

  return (
    <>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-raised p-2 shadow-(--shadow-1)">
      <div className="relative min-w-0 flex-1 basis-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="pl-9"
        />
        {pending ? (
          <Loader2
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-muted"
            aria-hidden
          />
        ) : null}
      </div>
      {selects.map((s) => (
        <Select
          key={s.name}
          value={params.get(s.name) ?? s.defaultValue}
          onChange={(e) => {
            if (timer.current) window.clearTimeout(timer.current);
            const value = e.target.value;
            navigate((next) => {
              applyQuery(next, query);
              if (value && value !== s.defaultValue) next.set(s.name, value);
              else next.delete(s.name);
            });
          }}
          aria-label={s.label}
          className="w-auto min-w-36"
        >
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current);
            setQuery("");
            navigate((next) => {
              next.delete("q");
              selects.forEach((s) => next.delete(s.name));
            });
          }}
        >
          <RotateCcw aria-hidden /> Clear
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setViewError(null);
          setViewsOpen(true);
        }}
      >
        <Bookmark aria-hidden /> Views{views.length > 0 ? ` (${views.length})` : ""}
      </Button>
    </div>

    <Dialog open={viewsOpen} onOpenChange={setViewsOpen}>
      <DialogContent>
        <DialogTitle>Saved views</DialogTitle>
        <DialogDescription>
          Keep a search and filter combination for this page. Views live in this browser only.
        </DialogDescription>
        <form onSubmit={saveView} className="mt-5 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="saved-view-name">Name this view</Label>
            <Input
              id="saved-view-name"
              value={viewName}
              onChange={(e) => {
                setViewName(e.target.value);
                setViewError(null);
              }}
              maxLength={32}
              placeholder="e.g. Unassigned this week"
              aria-invalid={viewError ? true : undefined}
              aria-describedby={viewError ? "saved-view-error" : undefined}
              autoFocus
            />
            {viewError ? (
              <p id="saved-view-error" className="text-body-sm text-danger">
                {viewError}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-body-sm text-ink-subtle">
              {hasFilters ? "Saves the current search and filters." : "Add a search or filter first."}
            </p>
            <Button type="submit" size="sm" disabled={!hasFilters || views.length >= MAX_SAVED_VIEWS}>
              Save current view
            </Button>
          </div>
          {views.length >= MAX_SAVED_VIEWS ? (
            <p className="text-body-sm text-ink-subtle">
              You can keep {MAX_SAVED_VIEWS} views; delete one to save another.
            </p>
          ) : null}
        </form>
        {views.length > 0 ? (
          <div className="mt-5 border-t border-hairline pt-4">
            <h3 className="mb-2 text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">
              On this page
            </h3>
            <ul className="grid gap-1">
              {views.map((view) => (
                <li key={view.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyView(view)}
                    className="min-w-0 flex-1 truncate rounded-sm px-2 py-1.5 text-left text-body-sm font-semibold hover:bg-sunken"
                  >
                    {view.name}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    aria-label={`Delete saved view ${view.name}`}
                    onClick={() => deleteView(view.name)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-5 border-t border-hairline pt-4 text-body-sm text-ink-subtle">
            No saved views yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
