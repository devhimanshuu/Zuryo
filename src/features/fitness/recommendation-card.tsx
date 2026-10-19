"use client";

import { Archive, Bot, CalendarPlus, ListChecks, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EQUIPMENT_LABELS, INTENSITY_LABELS } from "@/lib/fitness/labels";
import { categoryLabel } from "@/lib/booking/categories";
import { cn } from "@/lib/utils/cn";
import { formatDay } from "@/lib/utils/format";
import type { RecommendationOutput } from "@/lib/fitness/recommendation-schema";
import type { RecommendationFeedback, RecommendationSource } from "@/lib/validation/enums";
import { setRecommendationStatusAction, submitRecommendationFeedbackAction } from "@/server/actions/fitness";

export type RecommendationCardData = {
  id: string;
  source: RecommendationSource;
  status: "ACTIVE" | "ARCHIVED";
  title: string;
  explanation: string;
  category: string;
  durationMinutes: number;
  intensity: string;
  modelId: string | null;
  feedback: RecommendationFeedback | null;
  feedbackNote: string | null;
  createdAt: string;
  payload: RecommendationOutput;
};

function describeExercise(e: RecommendationOutput["exercises"][number]) {
  if (e.kind === "REPS") return `${e.sets} × ${e.reps}${e.cue ? ` — ${e.cue}` : ""}`;
  return `${e.durationMin} min${e.cue ? ` — ${e.cue}` : ""}`;
}

/** One recommendation: source badge, grounded explanation, full workout details and feedback. */
export function RecommendationCard({ rec }: { rec: RecommendationCardData }) {
  const router = useRouter();
  const [feedbackBusy, startFeedback] = useTransition();
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [archiving, startArchiving] = useTransition();
  const archived = rec.status === "ARCHIVED";

  function sendFeedback(feedback: RecommendationFeedback, includeNote: boolean) {
    startFeedback(async () => {
      try {
        const res = await submitRecommendationFeedbackAction({
          recommendationId: rec.id,
          feedback,
          note: includeNote ? note : "",
        });
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        toast.success(feedback === "USEFUL" ? "Marked as useful" : "Marked as not useful");
        setNoteOpen(false);
        router.refresh();
      } catch {
        toast.error("We couldn't save your feedback. Try again.");
      }
    });
  }

  return (
    <Card className={cn(archived && "opacity-80")}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{rec.title}</CardTitle>
            <p className="mt-0.5 text-body-sm text-ink-muted">
              {categoryLabel(rec.category as Parameters<typeof categoryLabel>[0])} · {rec.durationMinutes} min ·{" "}
              {INTENSITY_LABELS[rec.intensity as keyof typeof INTENSITY_LABELS]} intensity · generated{" "}
              {formatDay(new Date(rec.createdAt))}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold whitespace-nowrap",
              rec.source === "AI" ? "bg-accent-soft text-accent-text" : "bg-sunken text-ink-muted",
            )}
          >
            {rec.source === "AI" ? <Bot className="size-3.5" aria-hidden /> : <ListChecks className="size-3.5" aria-hidden />}
            {rec.source === "AI" ? "AI-generated" : "Rule-based"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-body-sm text-ink-muted">{rec.explanation}</p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
          <dt className="text-ink-muted">Equipment</dt>
          <dd className="font-semibold">
            {rec.payload.equipment.length
              ? rec.payload.equipment.map((e) => EQUIPMENT_LABELS[e]).join(", ")
              : "None"}
          </dd>
        </dl>

        <details className="rounded-md bg-sunken px-3 py-2">
          <summary className="cursor-pointer font-semibold">The workout</summary>
          <div className="mt-3 grid gap-3 text-body-sm">
            <p>{rec.payload.summary}</p>
            <ol className="grid gap-1.5">
              {rec.payload.exercises.map((e, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold">
                    {i + 1}. {e.name}
                  </span>
                  <span className="text-ink-muted tabular">{describeExercise(e)}</span>
                </li>
              ))}
            </ol>
            <p>
              <span className="font-semibold">Rest: </span>
              {rec.payload.rest}
            </p>
            <p>
              <span className="font-semibold">Warm-up: </span>
              {rec.payload.warmup}
            </p>
            <p>
              <span className="font-semibold">Cool-down: </span>
              {rec.payload.cooldown}
            </p>
            <p>
              <span className="font-semibold">Adaptations: </span>
              {rec.payload.adaptations}
            </p>
            <p className="text-ink-muted">{rec.payload.safety}</p>
          </div>
        </details>

        {rec.feedback ? (
          <p className="flex items-center gap-1.5 text-body-sm font-semibold">
            {rec.feedback === "USEFUL" ? <ThumbsUp className="size-4" aria-hidden /> : <ThumbsDown className="size-4" aria-hidden />}
            You marked this {rec.feedback === "USEFUL" ? "useful" : "not useful"}
            {rec.feedbackNote ? <span className="font-normal text-ink-muted"> — “{rec.feedbackNote}”</span> : null}
          </p>
        ) : (
          <div className="grid gap-2">
            <p className="text-body-sm text-ink-muted">Was this useful?</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" loading={feedbackBusy} onClick={() => sendFeedback("USEFUL", false)}>
                <ThumbsUp aria-hidden /> Useful
              </Button>
              <Button variant="ghost" size="sm" loading={feedbackBusy} onClick={() => setNoteOpen((v) => !v)}>
                <ThumbsDown aria-hidden /> Not useful
              </Button>
            </div>
            {noteOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="What would have helped?"
                  placeholder="What would have helped?"
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="max-w-sm"
                />
                <Button variant="secondary" size="sm" loading={feedbackBusy} onClick={() => sendFeedback("NOT_USEFUL", true)}>
                  Send feedback
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="primary" size="sm">
          <Link href={`/customer/bookings/new?category=${encodeURIComponent(rec.category)}`}>
            <CalendarPlus aria-hidden /> Book this workout
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={archiving}
          onClick={() =>
            startArchiving(async () => {
              try {
                const res = await setRecommendationStatusAction({
                  recommendationId: rec.id,
                  status: archived ? "ACTIVE" : "ARCHIVED",
                });
                if (!res.ok) {
                  toast.error(res.error.message);
                  return;
                }
                router.refresh();
              } catch {
                toast.error("We couldn't update this recommendation. Try again.");
              }
            })
          }
        >
          {archived ? (
            <>
              <RotateCcw aria-hidden /> Restore
            </>
          ) : (
            <>
              <Archive aria-hidden /> Dismiss
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
