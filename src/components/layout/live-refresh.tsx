"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Dispatch on `window` to ask for an immediate check (e.g. when a countdown reaches its deadline). */
export const LIVE_CHECK_EVENT = "zuryofit:live-check";

const POLL_MS = 20_000;

/**
 * Keeps an open workspace page current when someone else changes it: a trainer starting or
 * cancelling, a customer rescheduling, the server closing a session at 60 minutes. Polls a small
 * fingerprint (`/api/live`) while the tab is visible, checks again the moment it becomes visible,
 * and re-renders the page from the server only when the fingerprint moves. Client state such as a
 * half-filled form survives a refresh; nothing is trusted from this poll beyond "something changed".
 */
export function LiveRefresh() {
  const router = useRouter();
  const token = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let stopped = false;

    async function check() {
      clearTimeout(timer);
      if (inFlight || stopped) return;
      if (document.visibilityState === "visible" && navigator.onLine !== false) {
        inFlight = true;
        try {
          const res = await fetch("/api/live", { cache: "no-store" });
          if (res.ok) {
            const snap = (await res.json()) as { token: string; reconciled: boolean };
            const moved = token.current !== null && snap.token !== token.current;
            token.current = snap.token;
            if (moved || snap.reconciled) router.refresh();
          }
        } catch {
          // Offline or a cold server: the next tick tries again.
        } finally {
          inFlight = false;
        }
      }
      if (!stopped) timer = setTimeout(check, POLL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onRequest = () => void check();

    void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onRequest);
    window.addEventListener(LIVE_CHECK_EVENT, onRequest);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onRequest);
      window.removeEventListener(LIVE_CHECK_EVENT, onRequest);
    };
  }, [router]);

  return null;
}
