"use client";

import { Bot, ListChecks, Send, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COACH_ROUTE_NOTE, type CoachMessageView } from "@/lib/coach/thread";
import { cn } from "@/lib/utils/cn";
import { askCoachAction, clearCoachHistoryAction } from "@/server/actions/coach";

const SUGGESTIONS = [
  "How should I warm up before strength training?",
  "How many sessions are left in my package?",
  "What should I eat before a workout?",
  "How can I stay consistent?",
];

/**
 * The fitness-support chat. Answers arrive from the server (which enforces scope, safety and the
 * per-customer limits); this component only renders the thread, keeps an optimistic user bubble and
 * shows an honest error when nothing was saved. Every assistant reply is labelled with how it was
 * produced: the AI coach, or the curated rule-based reply used when no model answered.
 */
export function CoachChat({ initialMessages }: { initialMessages: CoachMessageView[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startAsking] = useTransition();
  const [clearing, startClearing] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

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
        router.refresh();
      } catch {
        setNotice("We couldn't clear the conversation. Try again.");
      }
    });
  }

  return (
    <div className="flex h-[70vh] min-h-[28rem] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <p className="text-body-sm text-ink-muted">
          Fitness questions only · not medical advice ·{" "}
          <span className="tabular">{messages.filter((m) => m.role === "USER").length}</span> asked
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          loading={clearing}
          disabled={messages.length === 0}
          aria-label="Clear conversation"
        >
          <Trash2 aria-hidden />
          Clear
        </Button>
      </div>

      <div ref={listRef} className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="grid justify-items-center gap-3 py-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden>
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-heading-md font-semibold">Ask your coach</p>
              <p className="mx-auto mt-1 max-w-[48ch] text-body-sm text-ink-muted">
                Training, warm-ups, recovery, everyday nutrition and your own Zuryo sessions. The coach uses your
                profile and recent sessions.
              </p>
            </div>
            <ul className="mt-1 grid w-full max-w-md gap-2">
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
          <ul className="grid gap-4">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex", m.role === "USER" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3 text-body-md",
                    m.role === "USER"
                      ? "bg-brand text-on-brand"
                      : "border border-hairline bg-surface text-ink",
                  )}
                >
                  {m.role === "ASSISTANT" ? (
                    <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-muted">
                      {m.source === "AI" ? <Bot className="size-3.5" aria-hidden /> : <ListChecks className="size-3.5" aria-hidden />}
                      {m.source === "AI" ? "AI coach" : "Curated answer"}
                      {m.route && m.route !== "ANSWERED" ? <span>· {COACH_ROUTE_NOTE[m.route]}</span> : null}
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
        className="border-t border-hairline px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        {notice ? (
          <Notice tone="danger" title="Not sent" live className="mb-3">
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
            className="min-h-20"
            maxLength={500}
            rows={2}
          />
          <Button type="submit" variant="primary" loading={busy} disabled={draft.trim().length < 2}>
            <Send aria-hidden />
            Send
          </Button>
        </div>
        <p className="mt-2 flex flex-wrap justify-between gap-2 text-body-sm text-ink-subtle">
          <span>Enter to send · Shift + Enter for a new line. The coach can&apos;t book, cancel or pay.</span>
          <span className="tabular">{draft.length}/500</span>
        </p>
      </form>
    </div>
  );
}
