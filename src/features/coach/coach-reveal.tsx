"use client";

import { useEffect, useRef, useState } from "react";
import { CoachMarkdown } from "./coach-markdown";

/** Characters revealed per second: quick enough not to slow reading, slow enough to see. */
const CHARS_PER_SECOND = 220;

/** Drops a dangling "**" so a half-revealed bold span never shows stray asterisks. */
function stripOpenBold(text: string): string {
  const marks = text.match(/\*\*/g)?.length ?? 0;
  return marks % 2 === 1 ? text.slice(0, text.lastIndexOf("**")) : text;
}

/**
 * Shows an assistant reply as a progressive reveal. This is a presentation effect on an answer that
 * already arrived whole (the server stores it first), not token streaming. It is skipped for people
 * who prefer reduced motion, and a tap on the text finishes it at once.
 */
export function RevealedMarkdown({
  content,
  animate,
  onDone,
}: {
  content: string;
  animate: boolean;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(animate ? 0 : content.length);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(content.length);
      done.current();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const n = Math.min(content.length, Math.floor(((now - start) / 1000) * CHARS_PER_SECOND));
      setShown(n);
      if (n >= content.length) {
        done.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, content]);

  const finished = shown >= content.length;
  return (
    <div
      onClick={() => {
        if (!finished) {
          setShown(content.length);
          done.current();
        }
      }}
    >
      <CoachMarkdown content={finished ? content : stripOpenBold(content.slice(0, shown))} isAssistant />
    </div>
  );
}
