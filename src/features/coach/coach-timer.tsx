"use client";

import { Check, Clock, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** Plays a gentle 2-tone pleasant chime using standard Web Audio API */
function playTimerChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch {
    /* AudioContext not allowed without user gesture or unsupported */
  }
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export type CoachTimerProps = {
  initialSeconds?: number;
  label?: string;
  onClose?: () => void;
  className?: string;
};

export function CoachTimer({
  initialSeconds = 60,
  label = "Rest Interval",
  onClose,
  className,
}: CoachTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setTotalSeconds(initialSeconds);
    setRemaining(initialSeconds);
    setRunning(false);
    setFinished(false);
  }, [initialSeconds]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          setFinished(true);
          playTimerChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function toggle() {
    if (finished) {
      setRemaining(totalSeconds);
      setFinished(false);
      setRunning(true);
      return;
    }
    setRunning((r) => !r);
  }

  function reset(newSec?: number) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const sec = newSec ?? totalSeconds;
    if (newSec) setTotalSeconds(newSec);
    setRemaining(sec);
    setRunning(false);
    setFinished(false);
  }

  const progress = totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-hairline bg-surface p-3 shadow-(--shadow-2) transition-all",
        finished && "border-success bg-success-soft/20",
        className,
      )}
      role="region"
      aria-label="Workout timer"
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline/60 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Clock className="size-3.5 text-brand" aria-hidden />
          <span>{label}</span>
          {finished && (
            <span className="py-0.2 inline-flex items-center gap-0.5 rounded-full bg-success px-1.5 text-[10px] font-bold text-on-brand">
              <Check className="size-2.5" /> Done
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-ink-muted hover:bg-raised hover:text-ink"
            aria-label="Close timer"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="my-2.5 flex items-center justify-between gap-3">
        <div className="font-mono text-2xl font-bold tracking-tight text-ink">{formatSeconds(remaining)}</div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={finished ? "primary" : running ? "secondary" : "primary"}
            className="h-8 px-3 text-xs"
            onClick={toggle}
          >
            {finished ? (
              <>
                <RotateCcw className="mr-1 size-3" /> Restart
              </>
            ) : running ? (
              <>
                <Pause className="mr-1 size-3" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-1 size-3" /> Start
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-ink-muted hover:text-ink"
            onClick={() => reset()}
            aria-label="Reset timer"
            title="Reset timer"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress track */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            finished ? "bg-success" : "bg-brand",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Quick presets */}
      <div className="mt-2.5 flex items-center gap-1.5 pt-1">
        <span className="text-[11px] font-medium text-ink-muted">Quick:</span>
        {[30, 45, 60, 90].map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => reset(sec)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
              totalSeconds === sec && !finished
                ? "bg-brand text-on-brand"
                : "bg-raised text-ink-muted hover:bg-brand-soft hover:text-brand",
            )}
          >
            {sec}s
          </button>
        ))}
        {finished && (
          <button
            type="button"
            onClick={playTimerChime}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink"
            title="Replay alert chime"
          >
            <Volume2 className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}
