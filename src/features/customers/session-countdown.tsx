"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Countdown to a session start. The server's clock is the anchor ("serverNow"), so a wrong device
 * clock can't make the countdown disagree with the rest of the page.
 */
export function SessionCountdown({
  startAt,
  serverNow,
  className,
}: {
  startAt: string;
  serverNow: string;
  className?: string;
}) {
  const serverNowMs = Date.parse(serverNow);
  const anchor = useRef(Date.now());
  const [now, setNow] = useState(serverNowMs);

  useEffect(() => {
    const tick = () => setNow(serverNowMs + (Date.now() - anchor.current));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [serverNowMs]);

  const diffMs = Date.parse(startAt) - now;
  if (diffMs <= 0) return <span className={className}>Starting now</span>;
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  const hours = Math.floor(minutes / 60);
  const text =
    minutes < 60
      ? `in ${minutes} min`
      : hours < 24
        ? `in ${hours}h ${String(minutes % 60).padStart(2, "0")}m`
        : `in ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"}`;
  return (
    <span className={className}>
      Starts <span className="tabular">{text}</span>
    </span>
  );
}
