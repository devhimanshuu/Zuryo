"use client";

import { MapPin, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WORKOUT_CATEGORY_INFO } from "@/lib/booking/categories";
import { cn } from "@/lib/utils/cn";
import { WORKOUT_CATEGORIES, type Role, type WorkoutCategory } from "@/lib/validation/enums";
import { updateProfileAction } from "@/server/actions/account";

type Field =
  | "name"
  | "phone"
  | "bio"
  | "experienceYears"
  | "workoutCategories"
  | "serviceZoneId"
  | "addressLine"
  | "specializations"
  | "acceptingBookings";

export type ProfileFormDefaults = {
  name: string;
  email: string;
  phone: string;
  serviceZoneId: string;
  addressLine: string;
  bio: string;
  experienceYears: string;
  /** Comma-separated focus areas, e.g. "Mobility, Posture". */
  specializations: string;
  workoutCategories: WorkoutCategory[];
  acceptingBookings: boolean;
};

/**
 * Edit everything about your account except the email, which is your sign-in identity (and what
 * Google sign-in matches on) and is shown locked.
 */
export function ProfileForm({
  role,
  defaults,
  zones,
}: {
  role: Role;
  defaults: ProfileFormDefaults;
  zones: Array<{ id: string; name: string; city: string }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: defaults.name,
    phone: defaults.phone,
    serviceZoneId: defaults.serviceZoneId,
    addressLine: defaults.addressLine,
    bio: defaults.bio,
    experienceYears: defaults.experienceYears,
    specializations: defaults.specializations,
  });
  const [categories, setCategories] = useState<WorkoutCategory[]>(defaults.workoutCategories);
  const [accepting, setAccepting] = useState(defaults.acceptingBookings);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set =
    (f: keyof typeof values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [f]: e.target.value }));

  function submit() {
    setErrors({});
    setFormError(null);
    const base = { name: values.name, phone: values.phone };
    const payload =
      role === "TRAINER"
        ? {
            role,
            ...base,
            serviceZoneId: values.serviceZoneId,
            bio: values.bio,
            experienceYears: values.experienceYears,
            workoutCategories: categories,
            specializations: values.specializations
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            acceptingBookings: accepting,
          }
        : role === "CUSTOMER"
          ? { role, ...base, serviceZoneId: values.serviceZoneId, addressLine: values.addressLine }
          : { role, ...base };
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

      <div className="grid gap-1.5">
        <Label htmlFor="acc-email">Email</Label>
        <Input
          id="acc-email"
          type="email"
          value={defaults.email}
          disabled
          readOnly
          className="cursor-not-allowed opacity-60"
        />
        <p className="text-body-sm text-ink-subtle">
          Your email is your sign-in identity and can&apos;t be changed here.
        </p>
      </div>

      {role !== "OPERATIONS" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="acc-zone">{role === "TRAINER" ? "Community you serve" : "Your community"}</Label>
          <div className="relative">
            <MapPin
              className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Select
              id="acc-zone"
              value={values.serviceZoneId}
              onChange={set("serviceZoneId")}
              className="pl-9"
              {...a11y("serviceZoneId")}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {z.city}
                </option>
              ))}
            </Select>
          </div>
          {err("serviceZoneId") ?? (
            <p className="text-body-sm text-ink-subtle">
              Can only change while you have no upcoming sessions.
            </p>
          )}
        </div>
      ) : null}

      {role === "CUSTOMER" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="acc-address">Tower / block and flat</Label>
          <Input
            id="acc-address"
            autoComplete="address-line1"
            maxLength={120}
            placeholder="e.g. Tower B, 1204"
            value={values.addressLine}
            onChange={set("addressLine")}
            {...a11y("addressLine")}
          />
          {err("addressLine") ?? (
            <p className="text-body-sm text-ink-subtle">Shown to your trainer so they can find you.</p>
          )}
        </div>
      ) : null}

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

          <div className="grid gap-1.5">
            <Label htmlFor="acc-focus">Focus areas</Label>
            <Input
              id="acc-focus"
              placeholder="e.g. Mobility, Posture, Weight loss"
              value={values.specializations}
              onChange={set("specializations")}
              {...a11y("specializations")}
            />
            {err("specializations") ?? (
              <p className="text-body-sm text-ink-subtle">Separate with commas. Up to six.</p>
            )}
          </div>

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

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-surface p-3">
            <input
              type="checkbox"
              checked={accepting}
              onChange={(e) => setAccepting(e.target.checked)}
              className="mt-0.5 size-4 accent-(--color-brand)"
            />
            <span>
              <span className="block text-sm font-semibold">Accepting new bookings</span>
              <span className="block text-body-sm text-ink-muted">
                Turn off to stop being matched to new sessions. Sessions you already have stay with you.
              </span>
            </span>
          </label>
        </>
      ) : null}

      {formError ? (
        <Notice tone="danger" title="Couldn't save your profile" live>
          {formError}
        </Notice>
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto">
          <Save aria-hidden /> Save changes
        </Button>
      </div>
    </form>
  );
}
