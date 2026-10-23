"use client";

import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  Clock,
  Info,
  Lightbulb,
  Package,
  Sparkles,
  Trophy,
} from "lucide-react";
import React, { useState } from "react";
import { CoachTimer } from "./coach-timer";
import { cn } from "@/lib/utils/cn";

export type CoachMarkdownProps = {
  content: string;
  isAssistant?: boolean;
};

/**
 * Parses bold syntax **text** into <strong> elements safely
 */
function renderInlineFormatting(text: string): React.ReactNode {
  // Split on **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/**
 * Detects callout prefixes (Tip, Note, Important, etc.)
 */
function getCalloutType(line: string): {
  type: "tip" | "note" | "warning" | "goal";
  title: string;
  body: string;
} | null {
  const match = line.match(
    /^(?:(?:\*\*|\b)(Tip|Pro Tip|Note|Important|Caution|Goal|Key Focus|Recovery Tip)(?:\*\*|\b)[:–-]\s*)(.*)/i,
  );
  if (!match) return null;

  const rawTitle = match[1] || "";
  const body = match[2] || "";
  const lower = rawTitle.toLowerCase();

  let type: "tip" | "note" | "warning" | "goal" = "note";
  if (lower.includes("tip") || lower.includes("recovery")) type = "tip";
  else if (lower.includes("important") || lower.includes("caution")) type = "warning";
  else if (lower.includes("goal") || lower.includes("focus")) type = "goal";

  return { type, title: rawTitle, body };
}

/**
 * Detects time durations mentioned in text (e.g. "30 seconds", "60s rest", "2 min")
 */
function extractTimerDuration(text: string): { seconds: number; label: string } | null {
  // Matches patterns like "30 seconds", "45s", "60 sec", "90 seconds", "2 minutes"
  const secMatch = text.match(/\b(15|30|45|60|90)\s*(seconds?|sec|s)\b/i);
  if (secMatch && secMatch[1]) {
    const sec = parseInt(secMatch[1], 10);
    return { seconds: sec, label: `${sec}s Interval` };
  }
  const minMatch = text.match(/\b([1-5])\s*(minutes?|mins?)\b/i);
  if (minMatch && minMatch[1]) {
    const sec = parseInt(minMatch[1], 10) * 60;
    return { seconds: sec, label: `${minMatch[1]}m Interval` };
  }
  return null;
}

export function CoachMarkdown({ content, isAssistant }: CoachMarkdownProps) {
  const [activeTimerSec, setActiveTimerSec] = useState<number | null>(null);
  const [activeTimerLabel, setActiveTimerLabel] = useState<string>("Rest Interval");

  if (!isAssistant) {
    return <p className="whitespace-pre-line text-body-md leading-relaxed">{content}</p>;
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: { type: "ordered" | "unordered"; items: string[] } | null = null;

  function flushList() {
    if (!currentList) return;
    if (currentList.type === "ordered") {
      elements.push(
        <ol key={`list-${elements.length}`} className="my-2 grid gap-1.5 pl-0.5">
          {currentList.items.map((item, idx) => {
            const timerInfo = extractTimerDuration(item);
            return (
              <li key={idx} className="flex items-start gap-2 text-body-sm leading-relaxed">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <span>{renderInlineFormatting(item)}</span>
                  {timerInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTimerSec(timerInfo.seconds);
                        setActiveTimerLabel(timerInfo.label);
                      }}
                      className="ml-2 inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand hover:text-on-brand transition-colors"
                    >
                      <Clock className="size-2.5" />
                      <span>{timerInfo.seconds}s timer</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>,
      );
    } else {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-2 grid gap-1.5 pl-1">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-body-sm leading-relaxed">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <span>{renderInlineFormatting(item)}</span>
            </li>
          ))}
        </ul>,
      );
    }
    currentList = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) {
      flushList();
      continue;
    }

    // Callout detection
    const callout = getCalloutType(line);
    if (callout) {
      flushList();
      elements.push(
        <div
          key={`callout-${i}`}
          className={cn(
            "my-2 flex items-start gap-2.5 rounded-lg border p-2.5 text-body-sm leading-relaxed",
            callout.type === "tip" && "border-brand-soft bg-brand-soft/40 text-brand-700 dark:text-brand-100",
            callout.type === "warning" && "border-warning/30 bg-warning-soft/30 text-ink",
            callout.type === "goal" && "border-info/30 bg-info-soft/30 text-ink",
            callout.type === "note" && "border-hairline bg-surface text-ink",
          )}
        >
          <span className="mt-0.5 shrink-0">
            {callout.type === "tip" && <Lightbulb className="size-4 text-brand" />}
            {callout.type === "warning" && <AlertCircle className="size-4 text-warning-600" />}
            {callout.type === "goal" && <Trophy className="size-4 text-info-600" />}
            {callout.type === "note" && <Info className="size-4 text-ink-muted" />}
          </span>
          <div>
            <span className="font-semibold">{callout.title}: </span>
            <span>{renderInlineFormatting(callout.body)}</span>
          </div>
        </div>,
      );
      continue;
    }

    // Ordered list (1. item)
    const orderedMatch = line.match(/^(\d+)[.)]\s+(.+)/);
    if (orderedMatch && orderedMatch[2]) {
      if (!currentList || currentList.type !== "ordered") {
        flushList();
        currentList = { type: "ordered", items: [] };
      }
      currentList.items.push(orderedMatch[2]);
      continue;
    }

    // Unordered list (- item or * item)
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch && bulletMatch[1]) {
      if (!currentList || currentList.type !== "unordered") {
        flushList();
        currentList = { type: "unordered", items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Heading (### Heading or **Heading**)
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 key={`h-${i}`} className="mt-2 text-body-md font-semibold text-ink">
          {line.replace(/^###\s+/, "")}
        </h4>,
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-body-sm leading-relaxed text-ink">
        {renderInlineFormatting(line)}
      </p>,
    );
  }

  flushList();

  // Detect concierge links for in-chat deep linking
  const lower = content.toLowerCase();
  const showBookingAction = lower.includes("book") || lower.includes("session") || lower.includes("schedule");
  const showPackageAction = lower.includes("package") || lower.includes("renewal") || lower.includes("sessions left");
  const showFitnessAction = lower.includes("goal") || lower.includes("workout plan") || lower.includes("assessment");

  return (
    <div className="space-y-1.5">
      {elements}

      {/* Embedded active timer if launched */}
      {activeTimerSec && (
        <div className="mt-3">
          <CoachTimer
            initialSeconds={activeTimerSec}
            label={activeTimerLabel}
            onClose={() => setActiveTimerSec(null)}
          />
        </div>
      )}

      {/* Concierge Deep Links if intent detected */}
      {(showBookingAction || showPackageAction || showFitnessAction) && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline/60 pt-2">
          {showBookingAction && (
            <Link
              href="/customer/bookings/new"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 py-1 text-xs font-semibold text-brand hover:border-brand hover:bg-brand-soft transition-colors"
            >
              <Calendar className="size-3" />
              Book a session
            </Link>
          )}
          {showPackageAction && (
            <Link
              href="/customer/packages"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 py-1 text-xs font-semibold text-ink-muted hover:border-brand hover:bg-brand-soft hover:text-brand transition-colors"
            >
              <Package className="size-3" />
              View packages
            </Link>
          )}
          {showFitnessAction && (
            <Link
              href="/customer/fitness"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 py-1 text-xs font-semibold text-ink-muted hover:border-brand hover:bg-brand-soft hover:text-brand transition-colors"
            >
              <Sparkles className="size-3" />
              My fitness plan
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
