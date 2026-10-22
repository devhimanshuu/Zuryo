"use client";

import { Dumbbell, FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GOAL_LABELS } from "@/lib/fitness/labels";
import type { FitnessGoal } from "@/lib/validation/enums";
import { generateRecommendationAction } from "@/server/actions/fitness";

const FALLBACK_MESSAGES: Record<string, string> = {
  UNCONFIGURED: "The AI provider isn't configured in this environment.",
  TIMEOUT: "The AI provider took too long to answer.",
  PROVIDER_ERROR: "The AI provider couldn't be reached.",
  INVALID_OUTPUT: "The AI provider's answer didn't pass Zuryo's validation.",
};

/**
 * Generates one recommendation for a chosen goal. The server enforces a one-per-minute cooldown
 * per customer, so mashing the button can't fire unbounded provider requests. When the provider
 * fails the server falls back to the deterministic templates and says so honestly.
 */
export function GenerateRecommendationButton({ goals }: { goals: FitnessGoal[] }) {
  const router = useRouter();
  const [goal, setGoal] = useState<FitnessGoal | "">(goals[0] ?? "");
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "warning" | "danger"; message: string } | null>(null);

  function generate() {
    if (!goal) return;
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await generateRecommendationAction({ goal });
        if (!res.ok) {
          setNotice({
            tone: res.error.code === "CONFLICT" ? "warning" : "danger",
            message: res.error.message,
          });
          return;
        }
        if (res.data.usedFallback) {
          const reason = res.data.fallbackReason ? ` (${FALLBACK_MESSAGES[res.data.fallbackReason] ?? res.data.fallbackReason})` : "";
          toast.warning("Generated from Zuryo's curated templates", {
            description: `The AI wasn't available${reason}, so this workout is rule-based, not AI-generated.`,
          });
        } else {
          toast.success("Workout generated");
        }
        router.refresh();
      } catch {
        setNotice({ tone: "danger", message: "We couldn't reach Zuryo. Nothing was generated; try again." });
      }
    });
  }

  return (
    <div className="grid gap-3">
      {notice ? (
        <Notice tone={notice.tone} title={notice.tone === "danger" ? "Not generated" : "Slow down"} live>
          {notice.message}
        </Notice>
      ) : null}
      {goals.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Select goals in your profile first, then generate a workout.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="gen-goal">Workout goal</Label>
            <Select id="gen-goal" value={goal} onChange={(e) => setGoal(e.target.value as FitnessGoal)}>
              {goals.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="primary" loading={busy} onClick={generate}>
            {busy ? (
              "Generating…"
            ) : (
              <>
                <Dumbbell aria-hidden /> Generate workout
              </>
            )}
          </Button>
        </div>
      )}
      <p className="flex items-start gap-1.5 text-body-sm text-ink-subtle">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        Powered by AI when available, otherwise by Zuryo&apos;s curated templates. Recommendations are labelled with
        which one produced them. One per minute.
      </p>
    </div>
  );
}
