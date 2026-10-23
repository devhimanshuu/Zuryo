"use client";

import { ArrowRight, Dumbbell, Lock, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WORKOUT_CATEGORY_INFO } from "@/lib/booking/categories";
import { PASSWORD_RULES } from "@/lib/validation/auth";
import { ROLE_HOME, WORKOUT_CATEGORIES, type Role, type WorkoutCategory } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";
import { completeGoogleSignUpAction, signUpAction } from "@/server/actions/auth";

type Zone = { id: string; name: string; city: string };
type Fields =
  "name" | "email" | "phone" | "serviceZoneId" | "password" | "workoutCategories" | "experienceYears" | "bio";
type SignUpRole = Extract<Role, "CUSTOMER" | "TRAINER">;

const ROLE_OPTIONS: Array<{ role: SignUpRole; label: string; hint: string; icon: typeof UserRound }> = [
  { role: "CUSTOMER", label: "Customer", hint: "Book sessions, packages and fitness", icon: UserRound },
  { role: "TRAINER", label: "Trainer", hint: "Take sessions and manage your schedule", icon: Dumbbell },
];

const iconClass = "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle";

/** Sign-up for customers and trainers. On success the new account is signed in straight away. */
export function SignUpForm({
  zones,
  google,
}: {
  zones: Zone[];
  /** Set when finishing a Google sign-up: name and email are already verified, and there is no password. */
  google?: { name: string; email: string };
}) {
  const router = useRouter();
  const [role, setRole] = useState<SignUpRole>("CUSTOMER");
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    serviceZoneId: "",
    password: "",
    experienceYears: "",
    bio: "",
  });
  const [categories, setCategories] = useState<WorkoutCategory[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set =
    (field: keyof typeof values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value }));

  const toggleCategory = (c: WorkoutCategory) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  function submit() {
    setErrors({});
    setFormError(null);
    const payload = google
      ? role === "CUSTOMER"
        ? { role, phone: values.phone, serviceZoneId: values.serviceZoneId }
        : { role, ...values, workoutCategories: categories }
      : role === "CUSTOMER"
        ? {
            role,
            name: values.name,
            email: values.email,
            phone: values.phone,
            serviceZoneId: values.serviceZoneId,
            password: values.password,
          }
        : { role, ...values, workoutCategories: categories };
    startTransition(async () => {
      try {
        if (google) {
          const done = await completeGoogleSignUpAction(payload);
          if (!done.ok) {
            const next: Partial<Record<Fields, string>> = {};
            for (const [k, msgs] of Object.entries(done.error.fieldErrors ?? {})) next[k as Fields] = msgs[0];
            setErrors(next);
            setFormError(Object.keys(next).length ? null : done.error.message);
            return;
          }
          router.push(ROLE_HOME[done.data.role]);
          router.refresh();
          return;
        }
        const res = await signUpAction(payload);
        if (!res.ok) {
          const next: Partial<Record<Fields, string>> = {};
          for (const [k, msgs] of Object.entries(res.error.fieldErrors ?? {})) next[k as Fields] = msgs[0];
          setErrors(next);
          setFormError(Object.keys(next).length ? null : res.error.message);
          return;
        }
        const login = await signIn("credentials", {
          redirect: false,
          email: res.data.email,
          password: values.password,
          role: res.data.role,
        });
        if (login?.error) {
          router.push("/sign-in");
          return;
        }
        router.push(ROLE_HOME[res.data.role]);
        router.refresh();
      } catch {
        setFormError("We couldn't create your account. Check your connection and try again.");
      }
    });
  }

  const field = (id: Fields, label: string, control: React.ReactNode, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {errors[id] ? (
        <p id={`${id}-error`} role="alert" className="text-body-sm text-danger">
          {errors[id]}
        </p>
      ) : hint ? (
        <p className="text-body-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
  const a11y = (id: Fields) => ({
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
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">I am a</legend>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-sunken p-1">
          {ROLE_OPTIONS.map((o) => (
            <label
              key={o.role}
              className={cn(
                "relative flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150",
                role === o.role ? "bg-raised text-ink shadow-(--shadow-2)" : "text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="role"
                value={o.role}
                checked={role === o.role}
                onChange={() => {
                  setRole(o.role);
                  setErrors({});
                }}
                className="peer sr-only"
              />
              <o.icon
                className={cn("size-4 shrink-0", role === o.role ? "text-brand" : "text-ink-subtle")}
                aria-hidden
              />
              <span>{o.label}</span>
              <span className="pointer-events-none absolute inset-0 rounded-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus" />
            </label>
          ))}
        </div>
        <p className="text-body-sm text-ink-muted">{ROLE_OPTIONS.find((o) => o.role === role)?.hint}</p>
      </fieldset>

      {google ? (
        <div className="rounded-md border border-hairline bg-sunken px-3 py-2.5 text-body-sm">
          <p className="text-ink-muted">Signing up with Google as</p>
          <p className="font-semibold">{google.name}</p>
          <p className="text-ink-muted">{google.email}</p>
        </div>
      ) : (
        <>
          {field(
            "name",
            "Full name",
            <div className="relative">
              <UserRound className={iconClass} aria-hidden />
              <Input
                id="name"
                autoComplete="name"
                required
                value={values.name}
                onChange={set("name")}
                className="pl-9"
                {...a11y("name")}
              />
            </div>,
          )}
          {field(
            "email",
            "Email",
            <div className="relative">
              <Mail className={iconClass} aria-hidden />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={values.email}
                onChange={set("email")}
                className="pl-9"
                {...a11y("email")}
              />
            </div>,
          )}
        </>
      )}
      {field(
        "phone",
        "Phone (optional)",
        <div className="relative">
          <Phone className={iconClass} aria-hidden />
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={set("phone")}
            className="pl-9"
            {...a11y("phone")}
          />
        </div>,
      )}
      {field(
        "serviceZoneId",
        role === "TRAINER" ? "Community you serve" : "Your community",
        <div className="relative">
          <MapPin className={cn(iconClass, "z-10")} aria-hidden />
          <Select
            id="serviceZoneId"
            required
            value={values.serviceZoneId}
            onChange={set("serviceZoneId")}
            className="pl-9"
            {...a11y("serviceZoneId")}
          >
            <option value="" disabled>
              Select a community
            </option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} · {z.city}
              </option>
            ))}
          </Select>
        </div>,
        role === "TRAINER"
          ? "Customers here can be matched to you."
          : "Trainers are matched to your community.",
      )}

      {role === "TRAINER" ? (
        <>
          <fieldset
            className="grid gap-2"
            aria-describedby={errors.workoutCategories ? "categories-error" : undefined}
          >
            <legend className="mb-1 text-sm font-semibold">What do you teach?</legend>
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
                      onChange={() => toggleCategory(c)}
                      className="size-4 accent-(--color-brand)"
                    />
                    {WORKOUT_CATEGORY_INFO[c].label}
                  </label>
                );
              })}
            </div>
            {errors.workoutCategories ? (
              <p id="categories-error" role="alert" className="text-body-sm text-danger">
                {errors.workoutCategories}
              </p>
            ) : null}
          </fieldset>
          {field(
            "experienceYears",
            "Years of experience (optional)",
            <Input
              id="experienceYears"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              value={values.experienceYears}
              onChange={set("experienceYears")}
              {...a11y("experienceYears")}
            />,
          )}
          {field(
            "bio",
            "Short bio (optional)",
            <Textarea
              id="bio"
              rows={3}
              maxLength={400}
              value={values.bio}
              onChange={set("bio")}
              placeholder="Your style, certifications, who you love working with."
              {...a11y("bio")}
            />,
          )}
        </>
      ) : null}

      {google ? null : (
        <>
          {field(
            "password",
            "Password",
            <div className="relative">
              <Lock className={iconClass} aria-hidden />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={values.password}
                onChange={set("password")}
                className="pr-16 pl-9"
                {...a11y("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-controls="password"
                className="absolute top-1/2 right-1.5 h-8 -translate-y-1/2 rounded-sm px-2.5 text-body-sm font-semibold text-ink-muted hover:bg-sunken hover:text-ink"
              >
                {showPassword ? "Hide" : "Show"}
                <span className="sr-only"> password</span>
              </button>
            </div>,
            `At least ${PASSWORD_RULES.min} characters with a letter and a number.`,
          )}
        </>
      )}

      {formError ? (
        <Notice tone="danger" title="Couldn't create your account" live>
          {formError}
        </Notice>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        className="group mt-1 shadow-(--shadow-2)"
      >
        {google ? "Finish" : "Create"} {role === "TRAINER" ? "trainer" : "customer"} account
        {pending ? null : (
          <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        )}
      </Button>
    </form>
  );
}
