"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SESSION_ACTIVITIES_MAX,
  SUGGESTED_NEXT_MAX,
  TRAINER_NOTES_MAX,
  sessionSummarySchema,
  type SessionActivity,
} from "@/lib/validation/sessions";
import { saveSessionSummaryAction } from "@/server/actions/sessions";

type ActivityRow = { name: string; sets: string; reps: string; durationMin: string; durationSec: string };

const toRow = (a: SessionActivity): ActivityRow => ({
  name: a.name,
  sets: a.sets?.toString() ?? "",
  reps: a.reps?.toString() ?? "",
  durationMin: a.durationMin?.toString() ?? "",
  durationSec: a.durationSec?.toString() ?? "",
});

const EMPTY_ROW: ActivityRow = { name: "", sets: "", reps: "", durationMin: "", durationSec: "" };

/** What the inputs hold (strings). The shared schema parses this into numbers and drops blank rows. */
type SummaryForm = { bookingId: string; activities: ActivityRow[]; trainerNotes: string; suggestedNextWorkout: string };

// The schema's preprocessing makes its input type `unknown`; the form's own shape is declared above.
const summaryResolver = zodResolver(sessionSummarySchema) as unknown as Resolver<SummaryForm>;

/**
 * The trainer's structured session record: what was done, notes for the customer and a suggested
 * next workout. Validated with the same schema the server uses; the server also checks that this
 * trainer is assigned and that the session has started. Duration is not an input — it comes from
 * the server's start and completion timestamps.
 */
export function SessionSummaryForm({
  bookingId,
  defaults,
  customerFeedback,
}: {
  bookingId: string;
  defaults: { activities: SessionActivity[]; trainerNotes: string | null; suggestedNextWorkout: string | null };
  customerFeedback: string | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SummaryForm>({
    resolver: summaryResolver,
    defaultValues: {
      bookingId,
      activities: defaults.activities.length ? defaults.activities.map(toRow) : [EMPTY_ROW],
      trainerNotes: defaults.trainerNotes ?? "",
      suggestedNextWorkout: defaults.suggestedNextWorkout ?? "",
    },
  });
  const rows = useFieldArray({ control: form.control, name: "activities" });
  const errors = form.formState.errors;

  async function onSubmit(values: SummaryForm) {
    setServerError(null);
    try {
      // `values` is the schema's output: blank rows are already dropped; the server parses it again.
      const res = await saveSessionSummaryAction(values);
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      toast.success("Session summary saved", { description: "The customer sees it in their fitness history." });
      router.refresh();
    } catch {
      setServerError("We couldn't reach ZuryoFit, so nothing was saved. Try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session summary</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} method="post" noValidate className="grid gap-5">
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-body-sm font-semibold">Exercises and activities</legend>
            <ul className="grid gap-3">
              {rows.fields.map((row, i) => {
                const e = errors.activities?.[i];
                const message = e?.name?.message ?? e?.sets?.message ?? e?.reps?.message ?? e?.durationMin?.message;
                return (
                  <li key={row.id} className="grid gap-2 rounded-md bg-sunken p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_4.5rem_4.5rem_5rem_auto] sm:items-end">
                      <div className="grid gap-1">
                        <Label htmlFor={`act-${i}-name`} className="text-body-sm">
                          Exercise
                        </Label>
                        <Input id={`act-${i}-name`} placeholder="e.g. Goblet squat" {...form.register(`activities.${i}.name`)} />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`act-${i}-sets`} className="text-body-sm">
                          Sets
                        </Label>
                        <Input id={`act-${i}-sets`} inputMode="numeric" {...form.register(`activities.${i}.sets`)} />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`act-${i}-reps`} className="text-body-sm">
                          Reps
                        </Label>
                        <Input id={`act-${i}-reps`} inputMode="numeric" {...form.register(`activities.${i}.reps`)} />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`act-${i}-min`} className="text-body-sm">
                          Minutes
                        </Label>
                        <Input id={`act-${i}-min`} inputMode="numeric" {...form.register(`activities.${i}.durationMin`)} />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove exercise ${i + 1}`}
                        onClick={() => rows.remove(i)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                    {message ? <p className="text-body-sm text-danger">{message}</p> : null}
                  </li>
                );
              })}
            </ul>
            {rows.fields.length < SESSION_ACTIVITIES_MAX ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="justify-self-start"
                onClick={() => rows.append(EMPTY_ROW)}
              >
                <Plus aria-hidden /> Add exercise
              </Button>
            ) : null}
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="summary-notes">Notes for the customer</Label>
            <Textarea
              id="summary-notes"
              rows={3}
              maxLength={TRAINER_NOTES_MAX}
              placeholder="e.g. Good squat depth. Keep elbows tucked on rows."
              {...form.register("trainerNotes")}
            />
            {errors.trainerNotes?.message ? <p className="text-body-sm text-danger">{errors.trainerNotes.message}</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="summary-next">Suggested next workout</Label>
            <Input
              id="summary-next"
              maxLength={SUGGESTED_NEXT_MAX}
              placeholder="e.g. Lower-body strength with a short conditioning finisher"
              {...form.register("suggestedNextWorkout")}
            />
            {errors.suggestedNextWorkout?.message ? (
              <p className="text-body-sm text-danger">{errors.suggestedNextWorkout.message}</p>
            ) : null}
          </div>

          {customerFeedback ? (
            <p className="rounded-md bg-sunken px-3 py-2 text-body-sm">
              <span className="font-semibold">Customer feedback: </span>
              {customerFeedback}
            </p>
          ) : null}

          {serverError ? (
            <Notice tone="danger" title="Not saved" live>
              {serverError}
            </Notice>
          ) : null}
          <Button type="submit" variant="primary" className="justify-self-start" loading={form.formState.isSubmitting}>
            Save summary
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
