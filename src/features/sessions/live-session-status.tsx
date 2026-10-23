"use client";

import { Hourglass, TimerReset } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LIVE_CHECK_EVENT } from "@/components/layout/live-refresh";
import { warningAt } from "@/lib/sessions/lifecycle";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/utils/format";

function mmss(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * What the customer sees while their session runs: the server's start and end times, a countdown on
 * the server's clock (corrected for the device's) and the current phase. Display only; the status
 * itself changes on the server, and <LiveRefresh> brings the new state in. At the deadline it asks
 * for an immediate check so "Completed" appears without waiting for the next poll.
 */
export function LiveSessionStatus({
  startedAt,
  endsAt,
  serverNow,
  tz,
  inverse,
}: {
  startedAt: string;
  endsAt: string;
  serverNow: string;
  tz: string;
  inverse?: boolean;
}) {
  // Null until mounted, so server HTML and hydration agree; the countdown starts on the client.
  const [now, setNow] = useState<Date | null>(null);
  const askedAtDeadline = useRef(false);
  const start = new Date(startedAt);
  const end = new Date(endsAt);
  const wrapUp = warningAt({ endsAt: end });

  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setNow(new Date(Date.now() + offset));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [serverNow]);

  const due = now !== null && now >= end;
  useEffect(() => {
    if (!due || askedAtDeadline.current) return;
    askedAtDeadline.current = true;
    window.dispatchEvent(new Event(LIVE_CHECK_EVENT));
  }, [due]);

  const phase = now === null ? "RUNNING" : due ? "DUE" : now >= wrapUp ? "WRAP_UP" : "RUNNING";
  const pct =
    now === null
      ? 0
      : Math.min(100, ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);

  return (
    <div className="grid gap-3" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className={cn(
              "flex items-center gap-2 text-body-sm font-semibold",
              inverse ? "text-ink-inverse/80" : "text-ink-muted",
            )}
          >
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative size-2 rounded-full bg-accent" />
            </span>
            {phase === "DUE"
              ? "Finishing up"
              : phase === "WRAP_UP"
                ? "Wrapping up · last 5 minutes"
                : "In progress"}
          </p>
          <p
            role="timer"
            aria-label="Session time remaining"
            className={cn(
              "mt-1 text-numeric-lg font-semibold tracking-tight tabular",
              phase === "WRAP_UP" && !inverse && "text-warning",
              phase === "WRAP_UP" && inverse && "text-warning-inverse",
            )}
          >
            {now === null ? "--:--" : mmss(end.getTime() - now.getTime())}
            <span
              className={cn(
                "ml-2 text-body-sm font-normal",
                inverse ? "text-ink-inverse/70" : "text-ink-muted",
              )}
            >
              remaining
            </span>
          </p>
        </div>
        <p className={cn("text-body-sm tabular", inverse ? "text-ink-inverse/75" : "text-ink-muted")}>
          {formatTime(start, tz)} – {formatTime(end, tz)}
        </p>
      </div>
      <div
        className={cn("h-2 overflow-hidden rounded-full", inverse ? "bg-ink-inverse/15" : "bg-sunken")}
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-1000",
            phase === "RUNNING" ? (inverse ? "bg-success-inverse" : "bg-brand") : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className={cn(
          "flex items-center gap-1.5 text-body-sm",
          inverse ? "text-ink-inverse/70" : "text-ink-subtle",
        )}
      >
        {phase === "DUE" ? (
          <>
            <TimerReset className="size-4" aria-hidden /> The hour is up; ZuryoFit is closing the session.
          </>
        ) : (
          <>
            <Hourglass className="size-4" aria-hidden /> Wrap-up reminder at {formatTime(wrapUp, tz)}. Times
            are kept by ZuryoFit&apos;s server.
          </>
        )}
      </p>
    </div>
  );
}
