"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WORKOUT_CATEGORY_INFO } from "@/lib/booking/categories";
import { cn } from "@/lib/utils/cn";
import { WORKOUT_CATEGORIES, type Role, type WorkoutCategory } from "@/lib/validation/enums";
import { updateProfileAction } from "@/server/actions/account";

type Field = "name" | "phone" | "bio" | "experienceYears" | "workoutCategories";

/** Edit your own name and phone; trainers also edit the details customers see. Email is fixed. */
export function ProfileForm({
  role,
  defaults,
}: {
  role: Role;
  defaults: {
    name: string;
    phone: string;
    bio: string;
    experienceYears: string;
    workoutCategories: WorkoutCategory[];
  };
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: defaults.name,
    phone: defaults.phone,
    bio: defaults.bio,
    experienceYears: defaults.experienceYears,
  });
  const [categories, setCategories] = useState<WorkoutCategory[]>(defaults.workoutCategories);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (f: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [f]: e.target.value }));

  function submit() {
    setErrors({});
    setFormError(null);
    const payload =
      role === "TRAINER"
        ? { role, ...values, workoutCategories: categories }
        : { role, name: values.name, phone: values.phone };
    startTransition(async () => {
      try {
        const res = await updateProfileAction(payload);
        if (!res.ok) {
          const fieldErrors: Partial<Record<Field, string>> = {};
          for (const [k, msgs] of Object.entries(res.error.fieldErrors ?? {}))
            fieldErrors[k as Field] = msgs[0];
          setErrors(fieldErrors);
          setFormError(Object.keys(fieldErrors).length ? null : res.error.message);
          return;
        }
        toast.success("Profile saved");
        router.refresh();
      } catch {
        setFormError("We couldn't save your profile. Check your connection and try again.");
      }
    });
  }

  const err = (id: Field) =>
    errors[id] ? (
      <p id={`${id}-error`} role="alert" className="text-body-sm text-danger">
        {errors[id]}
      </p>
    ) : null;
  const a11y = (id: Field) => ({
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? `${id}-error` : undefined,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="acc-name">Full name</Label>
          <Input
            id="acc-name"
            autoComplete="name"
            value={values.name}
            onChange={set("name")}
            {...a11y("name")}
          />
          {err("name")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acc-phone">Phone</Label>
          <Input
            id="acc-phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={set("phone")}
            {...a11y("phone")}
          />
          {err("phone")}
        </div>
      </div>

      {role === "TRAINER" ? (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">What you teach</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {WORKOUT_CATEGORIES.map((c) => {
                const on = categories.includes(c);
                return (
                  <label
                    key={c}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm font-semibold transition-colors",
                      on
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-control bg-raised text-ink-muted hover:text-ink",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setCategories((prev) =>
                          prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                        )
                      }
                      className="size-4 accent-(--color-brand)"
                    />
                    {WORKOUT_CATEGORY_INFO[c].label}
                  </label>
                );
              })}
            </div>
            {err("workoutCategories")}
          </fieldset>
          <div className="grid gap-1.5 sm:max-w-48">
            <Label htmlFor="acc-exp">Years of experience</Label>
            <Input
              id="acc-exp"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              value={values.experienceYears}
              onChange={set("experienceYears")}
              {...a11y("experienceYears")}
            />
            {err("experienceYears")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-bio">Bio</Label>
            <Textarea
              id="acc-bio"
              rows={3}
              maxLength={400}
              value={values.bio}
              onChange={set("bio")}
              {...a11y("bio")}
            />
            {err("bio")}
          </div>
        </>
      ) : null}

      {formError ? (
        <Notice tone="danger" title="Couldn't save your profile" live>
          {formError}
        </Notice>
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={pending}>
          <Save aria-hidden /> Save changes
        </Button>
      </div>
    </form>
  );
}
