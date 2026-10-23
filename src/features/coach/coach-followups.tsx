"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { followUpsFor } from "@/lib/coach/followups";
import type { CoachRouteValue } from "@/lib/coach/scope";

/**
 * Next-step chips under the latest coach reply: questions to ask next, and links into the app for
 * things the coach cannot do itself (it never books or pays).
 */
export function CoachFollowUps({
  content,
  route,
  onAsk,
  disabled,
}: {
  content: string;
  route: CoachRouteValue | null;
  onAsk: (prompt: string) => void;
  disabled?: boolean;
}) {
  const { prompts, links } = followUpsFor(content, route);
  if (prompts.length === 0 && links.length === 0) return null;
  return (
    <div className="mt-3 grid gap-2 border-t border-hairline/50 pt-2.5" aria-label="Suggested next steps">
      {prompts.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {prompts.map((p) => (
            <li key={p}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAsk(p)}
                className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-left text-xs font-semibold text-ink-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand disabled:opacity-50"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand hover:underline"
              >
                {l.label}
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
