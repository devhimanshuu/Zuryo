"use client";

import { BadgeCheck, Check, Info } from "lucide-react";
import { categoryLabel } from "@/lib/booking/categories";
import { cn } from "@/lib/utils/cn";
import type { MatchResult } from "@/server/booking/matching-service";
import { choiceCard, initials } from "./shared";

export function TrainerPicker({
  match,
  selected,
  onSelect,
}: {
  match: MatchResult;
  selected: string | null;
  onSelect: (trainerId: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <fieldset className="grid min-w-0 gap-3">
        <legend className="sr-only">Choose your trainer</legend>
        {match.trainers.map((t) => (
          <label key={t.trainerId} className={cn(choiceCard, "items-start")}>
            <input
              type="radio"
              name="trainer"
              value={t.trainerId}
              checked={selected === t.trainerId}
              onChange={() => onSelect(t.trainerId)}
              className="sr-only"
              aria-labelledby={`trainer-${t.trainerId}-name`}
              aria-describedby={`trainer-${t.trainerId}-why`}
            />
            <span
              className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand"
              aria-hidden
            >
              {initials(t.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span id={`trainer-${t.trainerId}-name`} className="font-semibold">
                  {t.name}
                  {t.rank === 1 ? <span className="sr-only">, best match</span> : null}
                </span>
                {t.rank === 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                    <BadgeCheck className="size-3.5" aria-hidden /> Best match
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-body-sm text-ink-muted">
                {t.specializations.join(" · ")}
                {t.experienceYears ? ` · ${t.experienceYears} years coaching` : ""}
              </span>
              {t.bio ? <span className="mt-1 block text-body-sm text-ink-subtle">{t.bio}</span> : null}
              <span id={`trainer-${t.trainerId}-why`} className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {t.reasons.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1.5 text-body-sm text-ink-muted">
                    <Check className="size-3.5 text-success" strokeWidth={2.5} aria-hidden />
                    {r}
                  </span>
                ))}
              </span>
            </span>
            <span
              className={cn(
                "mt-1 grid size-5 shrink-0 place-items-center rounded-full border",
                selected === t.trainerId ? "border-brand bg-brand text-on-brand" : "border-control",
              )}
              aria-hidden
            >
              {selected === t.trainerId ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <details className="rounded-md bg-sunken px-4 py-3 text-body-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold">
          <Info className="size-4" aria-hidden /> How we match trainers for{" "}
          {categoryLabel(match.category).toLowerCase()}
        </summary>
        <p className="mt-2 text-ink-muted">{match.explanation}</p>
      </details>
    </div>
  );
}
