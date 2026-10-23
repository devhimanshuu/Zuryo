"use client";

import { Brain, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

const MEMORY_KEY = "zuryo:coach-memories";
const MAX_MEMORIES = 20;
const MAX_LENGTH = 200;

export type MemoryItem = {
  id: string;
  text: string;
  createdAt: string;
};

function loadMemories(): MemoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as MemoryItem[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveMemories(items: MemoryItem[]) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(items));
  } catch {
    /* storage full */
  }
}

/** Returns the stored memory items as a plain-text block suitable for system-prompt injection. */
export function getMemoryPromptBlock(): string {
  const memories = loadMemories();
  if (memories.length === 0) return "";
  const lines = memories.map((m, i) => `${i + 1}. ${m.text}`);
  return `\nCustomer's personal notes (they asked you to remember these):\n${lines.join("\n")}\n`;
}

export type CoachMemoryProps = {
  className?: string;
};

/**
 * "Coach Memory" panel: customers can teach the coach persistent facts like
 * "My society gym only has dumbbells up to 10kg" or "I prefer morning workouts".
 * Stored in localStorage and surfaced to the prompt context.
 */
export function CoachMemory({ className }: CoachMemoryProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setItems(loadMemories());
  }, []);

  function addMemory() {
    const text = draft.trim();
    if (!text || text.length < 3) {
      toast.error("Write a short fact for the coach to remember.");
      return;
    }
    if (items.length >= MAX_MEMORIES) {
      toast.error(`You can save up to ${MAX_MEMORIES} notes.`);
      return;
    }
    const item: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: text.slice(0, MAX_LENGTH),
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...items];
    setItems(next);
    saveMemories(next);
    setDraft("");
    toast.success("Memory saved!");
  }

  function removeMemory(id: string) {
    const next = items.filter((m) => m.id !== id);
    setItems(next);
    saveMemories(next);
    toast.success("Memory removed");
  }

  function clearAll() {
    setItems([]);
    saveMemories([]);
    toast.success("All memories cleared");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 py-1 text-xs font-semibold text-ink-muted hover:border-brand hover:bg-brand-soft hover:text-brand transition-colors",
          className,
        )}
        title="Coach Memory — things you've told the coach to remember"
      >
        <Brain className="size-3" />
        Memory
        {items.length > 0 && (
          <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand leading-none">
            {items.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={cn("rounded-lg border border-hairline bg-raised p-3 shadow-(--shadow-2) animate-fade-in", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-hairline/60 pb-2 mb-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-ink">
          <Brain className="size-3.5 text-brand" />
          Coach Memory
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-ink-muted hover:text-ink"
          aria-label="Close memory panel"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p className="text-[11px] text-ink-muted mb-2">
        Tell the coach facts it should always remember, like your gym equipment or schedule
        preferences. These stay on your device.
      </p>

      {/* Add form */}
      <div className="flex gap-1.5 mb-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMemory();
            }
          }}
          placeholder="e.g. My gym only has dumbbells up to 10kg"
          maxLength={MAX_LENGTH}
          className="text-xs h-8"
          aria-label="Add a memory for the coach"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={addMemory}
          disabled={draft.trim().length < 3}
          className="h-8 px-2 shrink-0"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      {/* Memories list */}
      {items.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-ink-subtle">
          No memories yet. Add one above!
        </p>
      ) : (
        <ul className="grid gap-1 max-h-40 overflow-y-auto">
          {items.map((m) => (
            <li
              key={m.id}
              className="group flex items-start gap-2 rounded-md bg-sunken/50 px-2 py-1.5 text-xs text-ink"
            >
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <span className="flex-1 leading-relaxed">{m.text}</span>
              <button
                type="button"
                onClick={() => removeMemory(m.id)}
                className="shrink-0 rounded p-0.5 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                aria-label={`Remove memory: ${m.text}`}
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="mt-2 flex items-center justify-between border-t border-hairline/60 pt-1.5">
          <span className="text-[10px] text-ink-subtle">{items.length}/{MAX_MEMORIES} notes · stored on your device</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] font-medium text-danger hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
