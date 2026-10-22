import type { BuzzerCue } from "@/lib/sessions/lifecycle";

/**
 * The session buzzer: tones synthesised with Web Audio (no audio files to load) plus a vibration
 * pattern on phones that support it. Browsers only let a page play sound after a user gesture, so
 * `unlockBuzzer()` runs on the trainer's taps: Start session, the sound toggle, or any tap on the page.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Call from a user gesture. Returns false when this browser has no Web Audio. */
export function unlockBuzzer(): boolean {
  const a = audio();
  if (!a) return false;
  if (a.state === "suspended") void a.resume();
  return true;
}

/** Whether a cue would be audible right now (false after a reload until the trainer taps). */
export function buzzerReady(): boolean {
  return ctx?.state === "running";
}

/** [offset s, duration s, frequency Hz] per tone; vibration in ms (on, off, on…). */
const PATTERN: Record<BuzzerCue, { tones: Array<[number, number, number]>; vibrate: number[] }> = {
  warning: {
    tones: [
      [0, 0.18, 880],
      [0.3, 0.18, 880],
      [0.6, 0.18, 880],
    ],
    vibrate: [200, 100, 200, 100, 200],
  },
  end: {
    tones: [
      [0, 0.45, 660],
      [0.55, 0.45, 880],
      [1.1, 0.9, 1047],
    ],
    vibrate: [600, 200, 600, 200, 900],
  },
};

export function buzz(cue: BuzzerCue, { sound }: { sound: boolean }) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(PATTERN[cue].vibrate);
  if (!sound) return;
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  const t0 = a.currentTime + 0.02;
  for (const [at, dur, freq] of PATTERN[cue].tones) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.05);
  }
}
