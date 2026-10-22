"use client";

import { useEffect, useState } from "react";
import { formatINR } from "@/lib/pricing";

/**
 * Counts from zero to the persisted value on first paint. The server renders the real number,
 * so the figure is correct without JavaScript and only animates once hydrated.
 */
export function AnimatedNumber({
  value,
  currency = false,
  className,
}: {
  value: number;
  currency?: boolean;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const duration = 650;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      // Whole steps while counting, then the exact value, so currency keeps its paise.
      setDisplay(progress < 1 ? Math.round(value * eased) : value);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    setDisplay(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={className}>{currency ? formatINR(display.toFixed(2)) : display.toLocaleString("en-IN")}</span>
  );
}
