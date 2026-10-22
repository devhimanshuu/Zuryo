"use client";

import { CircleCheck, Hourglass, Play, Square, TimerReset, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { SESSION_WARNING_BEFORE_END_MINUTES } from "@/lib/booking/rules";
import { buzzerCue, sessionPhase, warningAt, type BuzzerCue, type SessionClock } from "@/lib/sessions/lifecycle";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/utils/format";
import type { BookingStatus } from "@/lib/validation/enums";
import { completeSessionAction, startSessionAction, syncSessionAction } from "@/server/actions/sessions";
import type { SessionState } from "@/server/sessions/session-service";
import { buzz, buzzerReady, unlockBuzzer } from "./buzzer";

const SOUND_KEY = "zuryo:buzzer-sound";

function toClock(s: SessionState): SessionClock | null {
  if (!s.startedAt || !s.endsAt) return null;
  return {
    startedAt: new Date(s.startedAt),
    endsAt: new Date(s.endsAt),
    plannedMinutes: s.plannedMinutes,
    warningSentAt: s.warningSentAt ? new Date(s.warningSentAt) : null,
    completedAt: s.completedAt ? new Date(s.completedAt) : null,
  };
}

function mmss(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The trainer's live session screen. All timing comes from the server's SessionRecord: the browser
 * only counts down to the persisted deadline (corrected for its own clock drift), and when the
 * countdown crosses the warning or the deadline it asks the server to reconcile. Refreshing or
 * closing the page changes nothing; the server's reconciliation completes the session regardless.
 */
export function SessionConsole({
  initial,
  scheduledStart,
  startOpensAt,
  startClosesAt,
  tz,
}: {
  initial: SessionState;
  scheduledStart: string;
  startOpensAt: string;
  startClosesAt: string;
  tz: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // serverNow − clientNow: the countdown runs on the server's clock, not the device's. Measured at
  // load, then re-measured on every server reply (midpoint of the round trip), so a device clock
  // that drifts or is changed mid-session is corrected within a minute.
  const [offset, setOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const [now, setNow] = useState(() => new Date(Date.now() + offset));
  const synced = useRef<Set<string>>(new Set());
  const prevNow = useRef(now);
  const [sound, setSound] = useState(true);
  const [flash, setFlash] = useState<BuzzerCue | null>(null);
  const resync = (serverNow: string, sentAt: number) =>
    setOffset(Date.parse(serverNow) - (sentAt + Date.now()) / 2);

  useEffect(() => setState(initial), [initial]);
  useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      // Storage blocked: keep the default (sound on).
    }
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(t);
  }, [offset]);

  const clock = toClock(state);
  const phase = clock ? sessionPhase(clock, now) : null;
  const status = state.status as BookingStatus;

  // Cross a threshold → ask the server (idempotent); also re-check once a minute while running.
  useEffect(() => {
    if (status !== "IN_PROGRESS" || !clock) return;
    const marks = [
      { key: "warning", due: now >= warningAt(clock) && !state.warningSentAt },
      { key: "deadline", due: now >= clock.endsAt },
      { key: `minute-${Math.floor(now.getTime() / 60_000)}`, due: now.getSeconds() === 0 },
    ];
    const next = marks.find((m) => m.due && !synced.current.has(m.key));
    if (!next) return;
    synced.current.add(next.key);
    const sentAt = Date.now();
    void syncSessionAction({ bookingId: state.bookingId })
      .then((res) => {
        if (!res.ok) return;
        resync(res.data.serverNow, sentAt);
        setState(res.data);
        if (res.data.changed) router.refresh();
      })
      .catch(() => synced.current.delete(next.key));
  }, [now, status, clock, state.bookingId, state.warningSentAt, router]);

  // The buzzer: sound + vibration when the countdown crosses 55 and 60 minutes while this screen is
  // open. Each cue plays once per session per tab, so a reload doesn't repeat it.
  useEffect(() => {
    const prev = prevNow.current;
    prevNow.current = now;
    if (status !== "IN_PROGRESS" || !clock) return;
    const cue = buzzerCue(clock, prev, now);
    if (!cue) return;
    const key = `zuryo:buzz:${state.bookingId}:${cue}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: buzz anyway; at worst a reload repeats the cue.
    }
    buzz(cue, { sound });
    setFlash(cue);
  }, [now, status, clock, state.bookingId, sound]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);
  // Browsers only allow sound after a gesture: any tap on the page arms the buzzer.
  useEffect(() => {
    if (status !== "IN_PROGRESS" && status !== "CONFIRMED") return;
    const arm = () => void unlockBuzzer();
    document.addEventListener("pointerdown", arm);
    return () => document.removeEventListener("pointerdown", arm);
  }, [status]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // Not persisted; the choice still applies on this screen.
    }
    if (next && unlockBuzzer()) buzz("warning", { sound: true });
  }

  function run(action: typeof startSessionAction, okMessage: (s: SessionState) => string) {
    setError(null);
    unlockBuzzer();
    startTransition(async () => {
      try {
        const sentAt = Date.now();
        const res = await action({ bookingId: state.bookingId });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        resync(res.data.serverNow, sentAt);
        setState(res.data);
        toast.success(okMessage(res.data));
        router.refresh();
      } catch {
        setError("We couldn't reach Zuryo. Check your connection; nothing changes until the server confirms.");
      }
    });
  }

  const opens = new Date(startOpensAt);
  const closes = new Date(startClosesAt);
  const canStart = status === "CONFIRMED" && now >= opens && now <= closes;
  const canEnd = status === "IN_PROGRESS" && clock !== null && now >= warningAt(clock);
  const elapsedPct = clock
    ? Math.min(100, ((now.getTime() - clock.startedAt.getTime()) / (clock.endsAt.getTime() - clock.startedAt.getTime())) * 100)
    : 0;

  return (
    <div
      className={cn(
        "grid gap-5 rounded-lg border border-hairline bg-raised p-5 shadow-(--shadow-1) transition-shadow sm:p-6",
        flash === "warning" && "animate-pulse ring-4 ring-warning/40",
        flash === "end" && "animate-pulse ring-4 ring-danger/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-eyebrow font-semibold tracking-[0.08em] text-ink-muted uppercase">Live session</p>
        <div className="flex items-center gap-2">
          {status === "IN_PROGRESS" || status === "CONFIRMED" ? (
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              title={sound ? "Buzzer sound is on" : "Buzzer sound is off"}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-body-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
              Buzzer {sound ? "on" : "off"}
            </button>
          ) : null}
          <StatusBadge status={status} />
        </div>
      </div>

      {status === "CONFIRMED" ? (
        <div className="grid gap-4">
          <p className="text-heading-lg font-semibold">Scheduled for {formatTime(new Date(scheduledStart), tz)}</p>
          <p className="text-body-sm text-ink-muted">
            You can start between {formatTime(opens, tz)} and {formatTime(closes, tz)}. The 60-minute timer starts
            when you press Start and is kept by the server.
          </p>
          <div>
            <Button
              variant="instant"
              size="lg"
              disabled={!canStart}
              loading={pending}
              onClick={() => run(startSessionAction, (s) => `Session started. Ends at ${formatTime(new Date(s.endsAt!), tz)}.`)}
            >
              {!pending ? <Play aria-hidden /> : null} Start session
            </Button>
          </div>
          {!canStart ? (
            <p className="text-body-sm text-ink-subtle">
              {now < opens ? `Start opens at ${formatTime(opens, tz)}.` : "The start window has closed."}
            </p>
          ) : null}
        </div>
      ) : null}

      {status === "IN_PROGRESS" && clock ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-body-sm text-ink-muted">Time remaining</p>
              <p
                role="timer"
                aria-label="Time remaining"
                className={cn(
                  "text-numeric-xl font-semibold tracking-tight tabular",
                  phase === "WRAP_UP" && "text-warning",
                  phase === "DUE" && "text-danger",
                )}
              >
                {mmss(clock.endsAt.getTime() - now.getTime())}
              </p>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-body-sm">
              <dt className="text-ink-muted">Started</dt>
              <dd className="font-semibold tabular">{formatTime(clock.startedAt, tz)}</dd>
              <dt className="text-ink-muted">Ends</dt>
              <dd className="font-semibold tabular">{formatTime(clock.endsAt, tz)}</dd>
            </dl>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-label="Session progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(elapsedPct)}
          >
            <div
              className={cn("h-full rounded-full transition-[width]", phase === "RUNNING" ? "bg-brand" : "bg-accent")}
              style={{ width: `${elapsedPct}%` }}
            />
          </div>
          <div aria-live="polite">
            {phase === "WRAP_UP" ? (
              <Notice tone="warning" title={`${SESSION_WARNING_BEFORE_END_MINUTES} minutes left`}>
                Your session has reached {clock.plannedMinutes - SESSION_WARNING_BEFORE_END_MINUTES} minutes. Please
                begin wrapping up.
                {state.warningSentAt ? " (The customer was notified too.)" : ""}
              </Notice>
            ) : phase === "DUE" ? (
              <Notice tone="info" title="Time's up">
                <span className="inline-flex items-center gap-1.5">
                  <TimerReset className="size-4" aria-hidden /> Closing the session on the server…
                </span>
              </Notice>
            ) : (
              <p className="flex items-center gap-2 text-body-sm text-ink-muted">
                <Hourglass className="size-4" aria-hidden />
                Wrap-up reminder at {formatTime(warningAt(clock), tz)}. You can end the session from then.
              </p>
            )}
            {sound && !buzzerReady() ? (
              <p className="mt-2 text-body-sm text-ink-subtle">
                Tap anywhere on this screen to let the buzzer play sound at 55 and 60 minutes.
              </p>
            ) : null}
          </div>
          <div>
            <Button
              variant="secondary"
              disabled={!canEnd}
              loading={pending}
              onClick={() => run(completeSessionAction, () => "Session completed")}
            >
              {!pending ? <Square aria-hidden /> : null} End session
            </Button>
          </div>
        </div>
      ) : null}

      {status === "COMPLETED" && clock ? (
        <div className="grid gap-2">
          <p className="flex items-center gap-2 text-heading-lg font-semibold text-success">
            <CircleCheck className="size-6" aria-hidden /> Session completed
          </p>
          <p className="text-body-sm text-ink-muted">
            {formatTime(clock.startedAt, tz)} – {clock.completedAt ? formatTime(clock.completedAt, tz) : "—"} ·{" "}
            {state.completionSource === "DEADLINE"
              ? "closed automatically at the 60-minute end time"
              : "ended by you"}
          </p>
        </div>
      ) : null}

      {status === "CANCELLED" ? <p className="text-ink-muted">This booking was cancelled.</p> : null}

      {error ? (
        <Notice tone="danger" live>
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
