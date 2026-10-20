"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EQUIPMENT_LABELS,
  ENVIRONMENT_LABELS,
  GOAL_LABELS,
  INTENSITY_LABELS,
  PREFERENCE_LABELS,
} from "@/lib/fitness/labels";
import { cn } from "@/lib/utils/cn";
import {
  EQUIPMENT_OPTIONS,
  FITNESS_GOALS,
  FITNESS_LEVELS,
  WORKOUT_ENVIRONMENTS,
  WORKOUT_INTENSITIES,
  WORKOUT_PREFERENCES,
  type EquipmentOption,
  type FitnessGoal,
  type WorkoutEnvironment,
  type WorkoutIntensity,
  type WorkoutPreference,
} from "@/lib/validation/enums";
import { AGE_RANGE, WEIGHT_KG_RANGE, fitnessProfileSchema, type FitnessProfileInput } from "@/lib/validation/fitness";
import { saveFitnessProfileAction } from "@/server/actions/fitness";

export type FitnessProfileDefaults = {
  age: number | null;
  /** Kilograms as a decimal string ("72.5"), or null. */
  weightKg: string | null;
  workoutPreferences: WorkoutPreference[];
  level: string | null;
  goals: FitnessGoal[];
  goalDetails: Partial<Record<FitnessGoal, { target: string; targetDate: string; status: "ACTIVE" | "COMPLETED" }>>;
  intensity: WorkoutIntensity | null;
  equipment: EquipmentOption[];
  environment: WorkoutEnvironment | null;
  avoidExercises: string | null;
  accommodations: string | null;
  movementLimitations: string | null;
  goalDetailsText: string | null;
};

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

/**
 * Creates/edits the customer's fitness profile. Validation runs with the same Zod schema the
 * server uses; the server repeats it and scopes the write to the acting customer. Goals, targets
 * and statuses are saved atomically with the rest of the profile.
 */
export function FitnessProfileForm({ defaults }: { defaults: FitnessProfileDefaults }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FitnessProfileInput>({
    resolver: zodResolver(fitnessProfileSchema),
    defaultValues: {
      age: defaults.age ?? "",
      weightKg: defaults.weightKg ?? "",
      workoutPreferences: defaults.workoutPreferences,
      fitnessLevel: defaults.level as FitnessProfileInput["fitnessLevel"],
      fitnessGoals: defaults.goals,
      goals: Object.fromEntries(
        defaults.goals.map((g) => [
          g,
          {
            target: defaults.goalDetails[g]?.target ?? "",
            targetDate: defaults.goalDetails[g]?.targetDate ?? "",
            status: defaults.goalDetails[g]?.status ?? "ACTIVE",
          },
        ]),
      ),
      intensity: defaults.intensity ?? undefined,
      equipment: defaults.equipment,
      environment: defaults.environment ?? undefined,
      avoidExercises: defaults.avoidExercises ?? "",
      accommodations: defaults.accommodations ?? "",
      movementLimitations: defaults.movementLimitations ?? "",
      goalDetails: defaults.goalDetailsText ?? "",
    },
  });

  const selectedGoals = form.watch("fitnessGoals");
  const errors = form.formState.errors;

  async function onSubmit(values: FitnessProfileInput) {
    setServerError(null);
    try {
      const res = await saveFitnessProfileAction(values);
      if (!res.ok) {
        setServerError(res.error.message);
        return;
      }
      toast.success("Profile saved", {
        description: "Recommendations will use these preferences from now on.",
      });
      router.refresh();
    } catch {
      setServerError("We couldn't reach Zuryo, so nothing was saved. Try again.");
    }
  }

  const fieldError = (m?: string) => (m ? <p className="mt-1 text-body-sm text-danger">{m}</p> : null);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} method="post" noValidate className="grid gap-6">
      <fieldset className="grid gap-4 rounded-lg border border-hairline bg-raised p-5">
        <legend className="px-1 font-semibold">About you</legend>
        <p className="text-body-sm text-ink-muted">
          Optional. Age helps keep recommendations appropriately conservative; weight is for your own
          progress record and is never sent to the AI provider.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pf-age">Age</Label>
            <Input
              id="pf-age"
              type="number"
              inputMode="numeric"
              min={AGE_RANGE.min}
              max={AGE_RANGE.max}
              placeholder="e.g. 32"
              {...form.register("age")}
            />
            {fieldError(errors.age?.message)}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-weight">Weight (kg)</Label>
            <Input
              id="pf-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={WEIGHT_KG_RANGE.min}
              max={WEIGHT_KG_RANGE.max}
              placeholder="e.g. 68.5"
              {...form.register("weightKg")}
            />
            {fieldError(errors.weightKg?.message)}
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-body-sm font-semibold">Workout preferences</p>
          <Controller
            control={form.control}
            name="workoutPreferences"
            render={({ field: f }) => (
              <div role="group" aria-label="Workout preferences" className="flex flex-wrap gap-2">
                {WORKOUT_PREFERENCES.map((p) => {
                  const on = f.value?.includes(p) ?? false;
                  return (
                    <label
                      key={p}
                      className={cn(
                        "cursor-pointer rounded-full border px-3.5 py-1.5 text-body-sm font-semibold",
                        on ? "border-brand bg-brand-soft text-brand" : "border-hairline bg-raised text-ink-muted hover:text-ink",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() =>
                          f.onChange(on ? (f.value ?? []).filter((x) => x !== p) : [...(f.value ?? []), p])
                        }
                      />
                      {PREFERENCE_LABELS[p]}
                    </label>
                  );
                })}
              </div>
            )}
          />
        </div>
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="grid content-start gap-4 rounded-lg border border-hairline bg-raised p-5">
          <legend className="px-1 font-semibold">Experience & intensity</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-level">Fitness experience</Label>
              <Select id="pf-level" {...form.register("fitnessLevel")}>
                <option value="">Not sure yet</option>
                {FITNESS_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-intensity">Preferred intensity</Label>
              <Select id="pf-intensity" {...form.register("intensity")}>
                <option value="">No preference</option>
                {WORKOUT_INTENSITIES.map((i) => (
                  <option key={i} value={i}>
                    {INTENSITY_LABELS[i]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-environment">Where you train</Label>
            <Select id="pf-environment" {...form.register("environment")}>
              <option value="">No preference</option>
              {WORKOUT_ENVIRONMENTS.map((e) => (
                <option key={e} value={e}>
                  {ENVIRONMENT_LABELS[e]}
                </option>
              ))}
            </Select>
          </div>
        </fieldset>

        <fieldset className="grid content-start gap-3 rounded-lg border border-hairline bg-raised p-5">
          <legend className="px-1 font-semibold">Equipment you have</legend>
          <p className="text-body-sm text-ink-muted">
            Optional. Recommendations only use equipment you list here.
          </p>
          <Controller
            control={form.control}
            name="equipment"
            render={({ field: f }) => (
              <div role="group" aria-label="Equipment" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EQUIPMENT_OPTIONS.map((e) => {
                  const on = f.value?.includes(e) ?? false;
                  return (
                    <label
                      key={e}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-body-sm font-semibold",
                        on ? "border-brand bg-brand-soft text-brand" : "border-hairline bg-raised text-ink-muted hover:text-ink",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() =>
                          f.onChange(on ? (f.value ?? []).filter((x) => x !== e) : [...(f.value ?? []), e])
                        }
                      />
                      {EQUIPMENT_LABELS[e]}
                    </label>
                  );
                })}
              </div>
            )}
          />
        </fieldset>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-hairline bg-raised p-5">
        <legend className="px-1 font-semibold">Your goals</legend>
        <p className="text-body-sm text-ink-muted">
          Pick up to four. Add an optional target for each — recommendations and the trainer view use these.
        </p>
        <Controller
          control={form.control}
          name="fitnessGoals"
          render={({ field: f }) => (
            <div role="group" aria-label="Fitness goals" className="flex flex-wrap gap-2">
              {FITNESS_GOALS.map((g) => {
                const on = f.value?.includes(g) ?? false;
                return (
                  <label
                    key={g}
                    className={cn(
                      "cursor-pointer rounded-full border px-3.5 py-1.5 text-body-sm font-semibold",
                      on ? "border-brand bg-brand text-on-brand" : "border-hairline bg-raised text-ink-muted hover:text-ink",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() =>
                        f.onChange(on ? (f.value ?? []).filter((x) => x !== g) : [...(f.value ?? []), g])
                      }
                    />
                    {GOAL_LABELS[g]}
                  </label>
                );
              })}
            </div>
          )}
        />
        {fieldError(errors.fitnessGoals?.message ?? errors.fitnessGoals?.root?.message)}

        {selectedGoals.length > 0 ? (
          <ul className="grid gap-3">
            {selectedGoals.map((g) => (
              <li key={g} className="grid gap-3 rounded-md bg-sunken p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor={`pf-goal-${g}`}>{GOAL_LABELS[g]} — target (optional)</Label>
                  <Input id={`pf-goal-${g}`} placeholder="e.g. Train three times a week" {...form.register(`goals.${g}.target`)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`pf-goal-${g}-date`}>By when (optional)</Label>
                  <Input id={`pf-goal-${g}-date`} type="date" {...form.register(`goals.${g}.targetDate`)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`pf-goal-${g}-status`}>Status</Label>
                  <Select id={`pf-goal-${g}-status`} {...form.register(`goals.${g}.status`)}>
                    <option value="ACTIVE">Active</option>
                    <option value="COMPLETED">Completed</option>
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-avoid">
            Exercises to avoid <span className="font-normal text-ink-subtle">(optional)</span>
          </Label>
          <Textarea id="pf-avoid" rows={2} placeholder="e.g. Burpees, overhead presses" {...form.register("avoidExercises")} />
          {fieldError(errors.avoidExercises?.message)}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-limitations">
            Movement limitations <span className="font-normal text-ink-subtle">(optional, only what you want to share)</span>
          </Label>
          <Textarea
            id="pf-limitations"
            rows={2}
            placeholder="e.g. Tight shoulders, previous knee strain"
            {...form.register("movementLimitations")}
          />
          {fieldError(errors.movementLimitations?.message)}
          <p className="text-body-sm text-ink-subtle">
            This helps us pick safer exercises. It is not medical advice and nothing here is diagnosed.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-accommodations">
            Accommodations <span className="font-normal text-ink-subtle">(optional)</span>
          </Label>
          <Textarea
            id="pf-accommodations"
            rows={2}
            placeholder="e.g. Prefer seated options for warm-up"
            {...form.register("accommodations")}
          />
          {fieldError(errors.accommodations?.message)}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-goaldetails">
            Goal notes <span className="font-normal text-ink-subtle">(optional)</span>
          </Label>
          <Textarea
            id="pf-goaldetails"
            rows={2}
            placeholder="Anything else you're working towards"
            {...form.register("goalDetails")}
          />
          {fieldError(errors.goalDetails?.message)}
        </div>
      </div>

      {serverError ? (
        <Notice tone="danger" title="Not saved" live>
          {serverError}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-body-sm text-ink-muted">
          Saved to your profile and used for recommendations. Only you and the trainers you book with can see this.
        </p>
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
