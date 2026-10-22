"use client";

import { Bot, ListChecks, MessageCircle, Send, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { COACH_ROUTE_NOTE, type CoachMessageView } from "@/lib/coach/thread";
import { cn } from "@/lib/utils/cn";
import { askCoachAction, clearCoachHistoryAction, loadCoachThreadAction } from "@/server/actions/coach";

const SUGGESTIONS = [
  "How should I warm up before strength training?",
  "How many sessions are left in my package?",
  "How can I stay consistent?",
];

const LAUNCHER_SIZE = 56;
const EDGE = 12;
const LAUNCHER_GAP = 12;
const POSITION_KEY = "zuryo:coach-launcher";

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
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [busy, startAsking] = useTransition();
  const [clearing, startClearing] = useTransition();
  const [pos, setPos] = useState<Offset | null>(null);
  const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
  const posRef = useRef<Offset | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
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
  const suppressClickUntil = useRef(0);

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
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open, loaded]);

  function load() {
    setLoadError(null);
    startLoading(async () => {
      try {
        const res = await loadCoachThreadAction();
        if (!res.ok) {
          setLoadError(res.error.message);
          return;
        }
        setMessages(res.data);
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
    suppressClickUntil.current = Date.now() + 350;
    const saved = posRef.current;
    if (!saved) return;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(saved));
    } catch {
      /* the position just won't persist */
    }
  }

  function openFromClick() {
    if (Date.now() < suppressClickUntil.current) return;
    toggle();
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setNotice(null);
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
    setDraft("");
    startAsking(async () => {
      try {
        const res = await askCoachAction({ message: content });
        if (!res.ok) {
          setMessages((m) => m.filter((x) => x.id !== local.id));
          setDraft(content);
          setNotice(res.error.message);
          return;
        }
        setMessages((m) => [...m, res.data]);
      } catch {
        setMessages((m) => m.filter((x) => x.id !== local.id));
        setDraft(content);
        setNotice("We couldn't reach Zuryo. Nothing was saved; try again.");
      }
    });
  }

  function clear() {
    if (messages.length === 0 || clearing) return;
    if (!window.confirm("Clear your whole conversation with the coach?")) return;
    setNotice(null);
    startClearing(async () => {
      try {
        const res = await clearCoachHistoryAction();
        if (!res.ok) {
          setNotice(res.error.message);
          return;
        }
        setMessages([]);
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
        <div className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-4 py-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
            aria-hidden
          >
            <MessageCircle className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-heading-md font-semibold">Coach</h2>
            <p className="truncate text-body-sm text-ink-muted">
              Fitness questions only · not medical advice
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clear}
            loading={clearing}
            disabled={messages.length === 0}
            aria-label="Clear conversation"
            className="size-9"
          >
            <Trash2 aria-hidden />
          </Button>
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

        <div
          ref={listRef}
          className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto overscroll-contain px-4 py-4"
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
            <div className="grid gap-3">
              <div>
                <p className="text-heading-md font-semibold">Ask your coach</p>
                <p className="mt-1 text-body-sm text-ink-muted">
                  Training, warm-ups, recovery, everyday nutrition and your own Zuryo sessions. Answers use
                  your profile and recent sessions — and it can&apos;t book, cancel or take payment.
                </p>
              </div>
              <ul className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => send(s)}
                      className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-left text-body-sm font-semibold text-ink-muted transition-colors hover:border-control hover:bg-sunken hover:text-ink"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="grid gap-3">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex", m.role === "USER" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[88%] rounded-lg px-3.5 py-2.5 text-body-md",
                      m.role === "USER"
                        ? "bg-brand text-on-brand"
                        : "border border-hairline bg-surface text-ink",
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
                    <p className="whitespace-pre-line">{m.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {busy ? (
            <div className="flex justify-start" aria-label="The coach is writing">
              <div className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-4 py-3">
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
          className="shrink-0 border-t border-hairline px-4 py-3"
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
          <p className="mt-1.5 flex justify-between gap-2 text-body-sm text-ink-subtle">
            <span>Enter to send · Shift + Enter for a new line</span>
            <span className="tabular">{draft.length}/500</span>
          </p>
        </form>
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
