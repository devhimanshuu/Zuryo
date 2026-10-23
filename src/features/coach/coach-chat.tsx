"use client";

import {
  Bot,
  Clock,
  Copy,
  Download,
  ListChecks,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Send,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatTranscript, transcriptFileName } from "@/lib/coach/export";
import type { CoachNudge } from "@/lib/coach/nudge";
import { COACH_ROUTE_NOTE, type CoachMessageView } from "@/lib/coach/thread";
import {
  SUGGESTION_CATEGORIES,
  type SmartSuggestion,
  type SuggestionCategory,
} from "@/lib/coach/suggestions";
import { cn } from "@/lib/utils/cn";
import {
  askCoachAction,
  clearCoachHistoryAction,
  loadCoachThreadAction,
  undoLastCoachTurnAction,
} from "@/server/actions/coach";
import { CoachActions } from "./coach-actions";
import { CoachFeedback } from "./coach-feedback";
import { CoachFollowUps } from "./coach-followups";
import { CoachMenu, type CoachMenuItem } from "./coach-menu";
import { CoachMarkdown } from "./coach-markdown";
import { CoachMemory } from "./coach-memory";
import { RevealedMarkdown } from "./coach-reveal";
import { CoachTimer } from "./coach-timer";
import { CoachVoiceInput } from "./coach-voice-input";

const LAUNCHER_SIZE = 56;
const EDGE = 12;
const LAUNCHER_GAP = 12;
const POSITION_KEY = "zuryofit:coach-launcher";
const LANGUAGE_KEY = "zuryofit:coach-language";
const PINS_KEY = "zuryofit:coach-pins";

type Language = "en" | "hi";

/** Removes the newest turn from the list the way the server does: the reply and its question. */
function dropLastTurn(list: CoachMessageView[]): CoachMessageView[] {
  const out = [...list];
  if (out.at(-1)?.role === "ASSISTANT") out.pop();
  if (out.at(-1)?.role === "USER") out.pop();
  return out;
}

type Offset = { right: number; bottom: number };
type PanelBox = { left: number; top: number; width: number; height: number };

/** Keeps the launcher fully on screen, whichever edge it was dragged towards. */
function clampOffset(offset: Offset, width: number, height: number): Offset {
  const maxRight = Math.max(EDGE, window.innerWidth - width - EDGE);
  const maxBottom = Math.max(EDGE, window.innerHeight - height - EDGE);
  return {
    right: Math.min(Math.max(Math.round(offset.right), EDGE), maxRight),
    bottom: Math.min(Math.max(Math.round(offset.bottom), EDGE), maxBottom),
  };
}

/**
 * Opens the panel beside the launcher: above it when there is room, otherwise below. On a short
 * viewport the panel shrinks to the larger side rather than covering the launcher.
 */
function panelBoxFor(launcher: DOMRect): PanelBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // On a phone the chat is a near-full-screen sheet: a floating card leaves too little room to type.
  if (vw < 640) {
    return { left: EDGE, top: EDGE, width: vw - EDGE * 2, height: vh - EDGE * 2 };
  }
  const width = Math.min(vw - EDGE * 2, vw >= 1024 ? 400 : vw - 24);
  const desired = vw >= 1024 ? Math.min(vh * 0.76, 576) : Math.min(vh * 0.68, 512);
  const spaceAbove = launcher.top - LAUNCHER_GAP - EDGE;
  const spaceBelow = vh - launcher.bottom - LAUNCHER_GAP - EDGE;
  const above = spaceAbove >= spaceBelow;
  const available = Math.max(spaceAbove, spaceBelow);
  const height = Math.min(desired, vh - EDGE * 2, Math.max(available, Math.min(320, vh - EDGE * 2)));
  const top = above ? launcher.top - LAUNCHER_GAP - height : launcher.bottom + LAUNCHER_GAP;
  const left = Math.min(Math.max(launcher.right - width, EDGE), Math.max(EDGE, vw - width - EDGE));
  return {
    left: Math.round(left),
    top: Math.round(Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - height - EDGE))),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** "7:42 pm" for today, otherwise "22 Oct, 7:42 pm". Rendered client-side only, so no hydration drift. */
function messageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * The fitness-support chat as a floating assistant on every customer screen. The launcher can be
 * dragged anywhere in the viewport and remembers where it was dropped; its panel opens beside it.
 * Answers arrive from the server (which enforces scope, safety and the per-customer limits); this
 * component only renders the thread, keeps an optimistic user bubble and shows an honest error
 * when nothing was saved. The stored conversation is loaded the first time the panel opens, never
 * on page load. Every assistant reply is labelled with how it was produced: the AI coach, or the
 * curated rule-based reply used when no model answered.
 */
export function CoachChat() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<CoachMessageView[]>([]);
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [activeCategory, setActiveCategory] = useState<SuggestionCategory>("ALL");
  const [showQuickTimer, setShowQuickTimer] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [busy, startAsking] = useTransition();
  const [clearing, startClearing] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [pins, setPins] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [nudge, setNudge] = useState<CoachNudge | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<Offset | null>(null);
  const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
  const posRef = useRef<Offset | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialScrolled = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    width: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  // Rendered into <body> once mounted: the workspace frame animates with a transform, which would
  // otherwise anchor this "fixed" launcher to the page content instead of the window. The saved
  // position is read here too, so it never takes part in server rendering.
  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (typeof saved !== "object" || saved === null) return;
      const { right, bottom } = saved as Record<string, unknown>;
      if (typeof right !== "number" || typeof bottom !== "number") return;
      if (!Number.isFinite(right) || !Number.isFinite(bottom)) return;
      const next = clampOffset({ right, bottom }, LAUNCHER_SIZE, LAUNCHER_SIZE);
      posRef.current = next;
      setPos(next);
    } catch {
      /* storage unavailable: keep the default corner */
    }
  }, []);

  // Language and pins live in this browser only.
  useEffect(() => {
    try {
      const lang = localStorage.getItem(LANGUAGE_KEY);
      if (lang === "en" || lang === "hi") setLanguage(lang);
      const raw = localStorage.getItem(PINS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed))
        setPins(parsed.filter((x): x is string => typeof x === "string").slice(0, 200));
    } catch {
      /* storage unavailable: defaults */
    }
  }, []);

  function chooseLanguage(next: Language) {
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* the choice just won't persist */
    }
  }

  function togglePin(id: string) {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(PINS_KEY, JSON.stringify(next));
      } catch {
        /* the pin just won't persist */
      }
      return next;
    });
  }

  useEffect(() => {
    function onResize() {
      const current = posRef.current;
      if (!current) return;
      const next = clampOffset(current, LAUNCHER_SIZE, LAUNCHER_SIZE);
      posRef.current = next;
      setPos(next);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Placed before paint so the panel never flashes at a stale corner.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const launcher = launcherRef.current;
      if (!launcher) return;
      setPanelBox(panelBoxFor(launcher.getBoundingClientRect()));
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Escape backs out of the confirmation first, then closes the panel.
      setConfirmClear((asking) => {
        if (!asking) setOpen(false);
        return false;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Typing can start straight away: focus lands in the message box once the thread is ready.
  useEffect(() => {
    if (open && loaded && !loadError) inputRef.current?.focus();
  }, [open, loaded, loadError]);

  // A new reply scrolls to where it begins (so a long answer is read from the top); everything
  // else, including the first paint of a stored thread, goes to the bottom.
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const last = messages[messages.length - 1];
    const smooth = initialScrolled.current;
    initialScrolled.current = loaded;
    if (smooth && last?.role === "ASSISTANT") {
      const el = list.querySelector<HTMLElement>(`[data-msg="${CSS.escape(last.id)}"]`);
      if (el) {
        const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 12;
        list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        return;
      }
    }
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [messages, open, loaded]);

  useEffect(() => {
    if (busy) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [busy]);

  function load() {
    setLoadError(null);
    startLoading(async () => {
      try {
        const res = await loadCoachThreadAction();
        if (!res.ok) {
          setLoadError(res.error.message);
          return;
        }
        const data = res.data;
        if (Array.isArray(data)) {
          setMessages(data);
        } else {
          setMessages(data.messages);
          setSuggestions(data.suggestions);
          setNudge(data.nudge ?? null);
        }
        setLoaded(true);
      } catch {
        setLoadError("We couldn't load your conversation. Check your connection and try again.");
      }
    });
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!loaded && !loading) load();
  }

  // Pointer Events cover mouse, touch and pen. A press only becomes a drag after a few pixels, so a
  // plain tap still opens the panel; a real drag swallows the click that follows it.
  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    // A fresh press is a fresh interaction: only the click manufactured by this drag is ignored.
    suppressClick.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: window.innerWidth - rect.right,
      startBottom: window.innerHeight - rect.bottom,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers can't be captured; the handlers still run */
    }
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      // The panel follows the launcher only when it is next opened.
      setOpen(false);
    }
    const next = clampOffset(
      { right: drag.startRight - dx, bottom: drag.startBottom - dy },
      drag.width,
      drag.height,
    );
    posRef.current = next;
    setPos(next);
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* not captured */
    }
    if (!drag.moved) return;
    suppressClick.current = true;
    const saved = posRef.current;
    if (!saved) return;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(saved));
    } catch {
      /* the position just won't persist */
    }
  }

  function openFromClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    toggle();
  }

  /** One question: optimistic bubble, server call, honest rollback when nothing was saved. */
  async function ask(content: string) {
    const local: CoachMessageView = {
      id: `local-${Date.now()}`,
      role: "USER",
      content,
      route: null,
      source: null,
      modelId: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, local]);
    try {
      const res = await askCoachAction({ message: content, language });
      if (!res.ok) {
        setMessages((m) => m.filter((x) => x.id !== local.id));
        setDraft(content);
        setNotice(res.error.message);
        return;
      }
      setMessages((m) => [...m, res.data]);
      setRevealId(res.data.id);
    } catch {
      setMessages((m) => m.filter((x) => x.id !== local.id));
      setDraft(content);
      setNotice("We couldn't reach ZuryoFit. Nothing was saved; try again.");
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setNotice(null);
    setDraft("");
    startAsking(() => ask(content));
  }

  /** Regenerate asks the same question again; edit puts it back in the box to change first. */
  function redo(mode: "regenerate" | "edit") {
    if (busy) return;
    setNotice(null);
    startAsking(async () => {
      try {
        const undone = await undoLastCoachTurnAction();
        if (!undone.ok) {
          setNotice(undone.error.message);
          return;
        }
        setMessages(dropLastTurn);
        if (mode === "edit") {
          setDraft(undone.data.question);
          inputRef.current?.focus();
          return;
        }
        await ask(undone.data.question);
      } catch {
        setNotice("We couldn't redo that. Check your connection and try again.");
      }
    });
  }

  function exportText() {
    return formatTranscript(messages, { exportedAt: new Date() });
  }

  function downloadChat() {
    const blob = new Blob([exportText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = transcriptFileName(new Date());
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Conversation downloaded");
  }

  async function copyChat() {
    try {
      await navigator.clipboard.writeText(exportText());
      toast.success("Conversation copied");
    } catch {
      toast.error("Couldn't copy the conversation");
    }
  }

  async function shareChat() {
    try {
      await navigator.share({ title: "ZuryoFit Coach conversation", text: exportText() });
    } catch {
      /* cancelled or unsupported: nothing to report */
    }
  }

  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const pinCount = messages.filter((m) => pins.includes(m.id)).length;
  const needle = query.trim().toLowerCase();
  const visible = messages.filter(
    (m) => (!needle || m.content.toLowerCase().includes(needle)) && (!pinnedOnly || pins.includes(m.id)),
  );
  const filtering = needle !== "" || pinnedOnly;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "ASSISTANT")?.id;
  const lastUserId = [...messages].reverse().find((m) => m.role === "USER")?.id;
  const lastId = messages.at(-1)?.id;

  const menuItems: CoachMenuItem[] = [
    { kind: "label", label: "Conversation" },
    {
      kind: "action",
      label: "Search messages",
      icon: <Search className="size-4" />,
      onSelect: openSearch,
      disabled: messages.length === 0,
    },
    {
      kind: "action",
      label: pinnedOnly ? "Show all messages" : `Pinned messages (${pinCount})`,
      icon: <Pin className="size-4" />,
      onSelect: () => setPinnedOnly((v) => !v),
      disabled: !pinnedOnly && pinCount === 0,
    },
    {
      kind: "action",
      label: "Download as text",
      icon: <Download className="size-4" />,
      onSelect: downloadChat,
      disabled: messages.length === 0,
    },
    {
      kind: "action",
      label: "Copy conversation",
      icon: <Copy className="size-4" />,
      onSelect: () => void copyChat(),
      disabled: messages.length === 0,
    },
    ...(canShare
      ? ([
          {
            kind: "action",
            label: "Share…",
            icon: <Share2 className="size-4" />,
            onSelect: () => void shareChat(),
            disabled: messages.length === 0,
          },
        ] as CoachMenuItem[])
      : []),
    { kind: "separator" },
    { kind: "label", label: "Reply language" },
    { kind: "radio", label: "English", checked: language === "en", onSelect: () => chooseLanguage("en") },
    {
      kind: "radio",
      label: "हिन्दी (Hindi)",
      checked: language === "hi",
      onSelect: () => chooseLanguage("hi"),
    },
    { kind: "separator" },
    {
      kind: "action",
      label: "Clear conversation",
      icon: <Trash2 className="size-4" />,
      onSelect: () => setConfirmClear(true),
      disabled: messages.length === 0,
      danger: true,
    },
  ];

  function clear() {
    if (clearing) return;
    setConfirmClear(false);
    setNotice(null);
    startClearing(async () => {
      try {
        const res = await clearCoachHistoryAction();
        if (!res.ok) {
          setNotice(res.error.message);
          return;
        }
        setMessages([]);
        setQuery("");
        setSearchOpen(false);
        setPinnedOnly(false);
      } catch {
        setNotice("We couldn't clear the conversation. Try again.");
      }
    });
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        ref={panelRef}
        id="coach-panel"
        role="dialog"
        aria-label="Coach"
        tabIndex={-1}
        hidden={!open}
        style={{
          left: panelBox?.left,
          top: panelBox?.top,
          width: panelBox?.width,
          height: panelBox?.height,
          visibility: panelBox ? undefined : "hidden",
        }}
        className={cn(
          "fixed z-40 flex flex-col overflow-hidden rounded-lg border border-hairline bg-raised shadow-(--shadow-3) focus:outline-none",
          open && "animate-rise",
        )}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4 py-3.5">
          <span
            className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand text-on-brand"
            aria-hidden
          >
            <Bot className="size-5" />
            <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface bg-success" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-heading-md leading-tight font-semibold">ZuryoFit Coach</h2>
            <p className="truncate text-body-sm text-ink-muted">
              Fitness questions only · not medical advice{language === "hi" ? " · Hindi replies" : ""}
            </p>
          </div>
          <Button
            type="button"
            variant={showQuickTimer ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setShowQuickTimer((v) => !v)}
            aria-label={showQuickTimer ? "Hide workout timer" : "Open workout timer"}
            title="Workout & rest timer"
            className="size-9"
          >
            <Clock className="size-4" />
          </Button>
          <CoachMenu items={menuItems} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Close coach panel"
            className="size-9"
          >
            <X aria-hidden />
          </Button>
        </div>

        {showQuickTimer && (
          <div className="animate-fade-in border-b border-hairline bg-surface p-3">
            <CoachTimer onClose={() => setShowQuickTimer(false)} />
          </div>
        )}

        {searchOpen || pinnedOnly ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3 py-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setQuery("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search this conversation"
                aria-label="Search this conversation"
                className="h-9 w-full rounded-md border border-control bg-raised pr-2 pl-8 text-body-sm focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand focus-visible:outline-none"
              />
            </div>
            <button
              type="button"
              aria-pressed={pinnedOnly}
              onClick={() => setPinnedOnly((v) => !v)}
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors",
                pinnedOnly ? "bg-brand text-on-brand" : "bg-sunken text-ink-muted hover:text-ink",
              )}
            >
              <Pin className="size-3.5" aria-hidden /> Pinned
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
                setPinnedOnly(false);
              }}
              className="grid size-9 place-items-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink"
              aria-label="Close search"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        {nudge && loaded && !filtering ? (
          <div className="flex shrink-0 items-start gap-3 border-b border-hairline bg-brand-soft/60 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold">{nudge.title}</p>
              <p className="text-body-sm text-ink-muted">{nudge.detail}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  send(nudge.prompt);
                  setNudge(null);
                }}
                className="mt-1.5 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:opacity-50"
              >
                {nudge.cta}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNudge(null)}
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-raised hover:text-ink"
              aria-label="Dismiss suggestion"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <div
          ref={listRef}
          className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto overscroll-contain bg-sunken/50 px-4 py-4"
          aria-live="polite"
        >
          {loading ? (
            <div className="grid gap-3" aria-label="Loading your conversation">
              <Skeleton className="ml-auto h-12 w-2/3 rounded-lg" />
              <Skeleton className="h-24 w-5/6 rounded-lg" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-lg" />
            </div>
          ) : loadError ? (
            <Notice tone="danger" title="Couldn't load your coach" live>
              <p>{loadError}</p>
              <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={load}>
                Try again
              </Button>
            </Notice>
          ) : messages.length === 0 ? (
            <div className="grid gap-4">
              <div className="grid justify-items-center gap-2 pt-2 text-center">
                <span
                  className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand"
                  aria-hidden
                >
                  <Bot className="size-6" />
                </span>
                <p className="text-heading-md font-semibold">Ask your coach</p>
                <p className="text-body-sm text-ink-muted">
                  Training, warm-ups, recovery, everyday nutrition and your own ZuryoFit sessions. Answers use
                  your profile and recent sessions — and it can&apos;t book, cancel or take payment.
                </p>
              </div>

              {/* Category Filter Chips */}
              <div className="flex flex-wrap gap-1.5 border-b border-hairline/60 pb-2">
                {SUGGESTION_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveCategory(cat.key)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                      activeCategory === cat.key
                        ? "bg-brand text-on-brand shadow-(--shadow-1)"
                        : "bg-raised text-ink-muted hover:bg-brand-soft hover:text-brand",
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Dynamic Suggestions List */}
              <ul className="grid gap-2">
                {(suggestions.length > 0
                  ? suggestions.filter((s) => activeCategory === "ALL" || s.category === activeCategory)
                  : [
                      { id: "1", text: "How should I warm up before strength training?" },
                      { id: "2", text: "How many sessions are left in my package?" },
                      { id: "3", text: "How can I stay consistent?" },
                    ]
                ).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => send(s.text)}
                      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-raised px-3.5 py-2.5 text-left text-body-sm font-semibold text-ink shadow-(--shadow-1) transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
                    >
                      <span className="flex-1">{s.text}</span>
                      {"badge" in s && s.badge ? (
                        <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">
                          {s.badge}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="grid gap-3">
              {filtering ? (
                <li className="text-center text-body-sm text-ink-muted">
                  {visible.length === 0
                    ? "No messages match."
                    : `${visible.length} message${visible.length === 1 ? "" : "s"} found`}
                </li>
              ) : null}
              {visible.map((m) => {
                const pinned = pins.includes(m.id);
                const settled = revealId !== m.id;
                const mine = m.role === "USER";
                return (
                  <li
                    key={m.id}
                    data-msg={m.id}
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-body-md",
                        mine
                          ? "rounded-br-sm bg-brand text-on-brand"
                          : "rounded-bl-sm border border-hairline bg-raised text-ink shadow-(--shadow-1)",
                        pinned && "ring-2 ring-warning/60",
                      )}
                    >
                      {m.role === "ASSISTANT" ? (
                        <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-muted">
                          {m.source === "AI" ? (
                            <Bot className="size-3.5" aria-hidden />
                          ) : (
                            <ListChecks className="size-3.5" aria-hidden />
                          )}
                          {m.source === "AI" ? "AI coach" : "Curated answer"}
                          {m.route && m.route !== "ANSWERED" ? (
                            <span>· {COACH_ROUTE_NOTE[m.route]}</span>
                          ) : null}
                        </p>
                      ) : null}
                      {mine ? (
                        <CoachMarkdown content={m.content} isAssistant={false} />
                      ) : (
                        <RevealedMarkdown
                          content={m.content}
                          animate={revealId === m.id}
                          onDone={() => setRevealId((cur) => (cur === m.id ? null : cur))}
                        />
                      )}
                      {m.role === "ASSISTANT" && settled && (
                        <CoachActions
                          content={m.content}
                          onSendPrompt={(prompt) => send(prompt)}
                          disabled={busy}
                        />
                      )}
                      {m.role === "ASSISTANT" && settled && <CoachFeedback messageId={m.id} />}
                      {m.role === "ASSISTANT" && settled && m.id === lastId && !busy && !filtering ? (
                        <CoachFollowUps
                          content={m.content}
                          route={m.route}
                          onAsk={(p) => send(p)}
                          disabled={busy}
                        />
                      ) : null}
                      <div
                        className={cn(
                          "mt-1.5 flex items-center gap-2 text-[11px]",
                          mine ? "justify-end text-on-brand/70" : "text-ink-subtle",
                        )}
                      >
                        <span>{messageTime(m.createdAt)}</span>
                        {!m.id.startsWith("local-") ? (
                          <button
                            type="button"
                            onClick={() => togglePin(m.id)}
                            aria-pressed={pinned}
                            aria-label={pinned ? "Unpin message" : "Pin message"}
                            title={pinned ? "Unpin" : "Pin this message"}
                            className="inline-flex items-center gap-0.5 rounded hover:text-current focus-visible:outline-2"
                          >
                            {pinned ? (
                              <PinOff className="size-3" aria-hidden />
                            ) : (
                              <Pin className="size-3" aria-hidden />
                            )}
                            {pinned ? "Unpin" : "Pin"}
                          </button>
                        ) : null}
                        {m.id === lastAssistantId && settled && !busy && !filtering ? (
                          <button
                            type="button"
                            onClick={() => redo("regenerate")}
                            className="inline-flex items-center gap-0.5 rounded hover:text-brand focus-visible:outline-2"
                            title="Ask again for a fresh answer"
                          >
                            <RotateCcw className="size-3" aria-hidden /> Regenerate
                          </button>
                        ) : null}
                        {m.id === lastUserId && !busy && !filtering && !m.id.startsWith("local-") ? (
                          <button
                            type="button"
                            onClick={() => redo("edit")}
                            className="inline-flex items-center gap-0.5 rounded hover:text-current focus-visible:outline-2"
                            title="Edit and resend this question"
                          >
                            <Pencil className="size-3" aria-hidden /> Edit
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {busy ? (
            <div className="flex justify-start" aria-label="The coach is writing">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-hairline bg-raised px-4 py-3">
                <span className="mr-1 text-body-sm text-ink-muted">Coach is thinking</span>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-1.5 animate-pulse rounded-full bg-ink-subtle"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <form
          ref={formRef}
          className="shrink-0 border-t border-hairline bg-raised px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          {notice ? (
            <Notice tone="danger" title="Not sent" live className="mb-2">
              {notice}
            </Notice>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              placeholder="Ask about training, recovery or your sessions…"
              aria-label="Your question for the coach"
              className="min-h-16"
              maxLength={500}
              rows={2}
              disabled={loading || !!loadError}
            />
            <CoachVoiceInput
              onTranscript={(transcript) => setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript))}
              disabled={loading || !!loadError || busy}
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              loading={busy}
              disabled={draft.trim().length < 2 || loading || !!loadError}
              aria-label="Send"
            >
              <Send aria-hidden />
            </Button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-body-sm text-ink-subtle">
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
              <CoachMemory />
            </div>
            <span className={cn("tabular", draft.length >= 450 && "font-semibold text-warning")}>
              {draft.length}/500
            </span>
          </div>
        </form>

        {confirmClear ? (
          <div
            className="absolute inset-0 z-10 grid animate-fade-in place-items-center bg-inverse/40 p-5"
            onClick={() => setConfirmClear(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="coach-clear-title"
              aria-describedby="coach-clear-desc"
              className="w-full max-w-[19rem] rounded-lg border border-hairline bg-raised p-5 shadow-(--shadow-3)"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                className="grid size-10 place-items-center rounded-full bg-danger/10 text-danger"
                aria-hidden
              >
                <Trash2 className="size-5" />
              </span>
              <h3 id="coach-clear-title" className="mt-3 text-heading-md font-semibold">
                Clear conversation?
              </h3>
              <p id="coach-clear-desc" className="mt-1 text-body-sm text-ink-muted">
                This permanently deletes your whole chat with the coach. It can&apos;t be undone.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  autoFocus
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={clear} loading={clearing}>
                  Clear chat
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <button
        ref={launcherRef}
        type="button"
        onClick={openFromClick}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        draggable={false}
        aria-expanded={open}
        aria-controls="coach-panel"
        aria-label={open ? "Close the coach" : "Ask the coach"}
        title={open ? undefined : "Ask the coach — drag to move"}
        style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
        className={cn(
          "fixed z-40 grid size-14 cursor-grab touch-none place-items-center rounded-full bg-brand text-on-brand shadow-(--shadow-3) transition-colors duration-150 ease-(--ease-standard) select-none hover:bg-brand-strong active:cursor-grabbing",
          !pos && "right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6",
        )}
      >
        {open ? <X className="size-5" aria-hidden /> : <MessageCircle className="size-5.5" aria-hidden />}
      </button>
    </>,
    document.body,
  );
}
