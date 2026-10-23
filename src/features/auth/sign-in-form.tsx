"use client";

import { ArrowRight, Dumbbell, LayoutDashboard, Lock, Mail, UserRound, type LucideIcon } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_PASSWORD } from "@/lib/auth/demo-password";
import { roleForCallback, safeCallbackUrl } from "@/lib/auth/callback-url";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";
import { DEMO_ACCOUNTS, DemoAccounts } from "./demo-accounts";

const ROLE_OPTIONS: Array<{ role: Role; label: string; hint: string; icon: LucideIcon }> = [
  { role: "CUSTOMER", label: "Customer", hint: "Book sessions, packages and fitness", icon: UserRound },
  { role: "TRAINER", label: "Trainer", hint: "Sessions, availability and your schedule", icon: Dumbbell },
  { role: "OPERATIONS", label: "Operations", hint: "Bookings, pricing and oversight", icon: LayoutDashboard },
];

const CALLBACK_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Email + password sign-in. Credentials go only to the NextAuth credentials endpoint. */
export function SignInForm({
  callbackUrl,
  workspaces = ["CUSTOMER", "TRAINER"],
}: {
  callbackUrl?: string;
  /** Which workspaces this page signs in to; one entry hides the picker. */
  workspaces?: Role[];
}) {
  const options = ROLE_OPTIONS.filter((o) => workspaces.includes(o.role));
  const router = useRouter();
  const [role, setRole] = useState<Role>(() => {
    const fromCallback = roleForCallback(callbackUrl, CALLBACK_ORIGIN);
    return fromCallback && workspaces.includes(fromCallback) ? fromCallback : workspaces[0]!;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitButton = useRef<HTMLButtonElement>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        role,
      });
      if (res?.error) {
        setError("That email and password didn't match an active account for this workspace.");
        return;
      }
      const destination = safeCallbackUrl(callbackUrl, role, CALLBACK_ORIGIN) ?? ROLE_HOME[role];
      router.push(destination);
      router.refresh();
    });
  }

  const pick = (accountRole: Role, accountEmail: string) => {
    setRole(accountRole);
    setEmail(accountEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
    // Ready to go: Enter or a tap signs in.
    requestAnimationFrame(() => submitButton.current?.focus());
  };

  const switchRole = (next: Role) => {
    setRole(next);
    setError(null);
    // A demo account picked for another workspace would only fail; clear it rather than submit it.
    const picked = DEMO_ACCOUNTS.find((a) => a.email === email);
    if (picked && picked.role !== next) {
      setEmail("");
      setPassword("");
    }
  };

  return (
    <div className="grid gap-6">
      {options.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">Workspace</legend>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-sunken p-1">
            {options.map((o) => (
              <label
                key={o.role}
                className={cn(
                  "relative flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150",
                  role === o.role
                    ? "bg-raised text-ink shadow-(--shadow-2)"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name="workspace"
                  value={o.role}
                  checked={role === o.role}
                  onChange={() => switchRole(o.role)}
                  className="peer sr-only"
                />
                <o.icon
                  className={cn(
                    "hidden size-4 shrink-0 sm:block",
                    role === o.role ? "text-brand" : "text-ink-subtle",
                  )}
                  aria-hidden
                />
                <span>{o.label}</span>
                <span className="pointer-events-none absolute inset-0 rounded-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus" />
              </label>
            ))}
          </div>
          <p className="text-body-sm text-ink-muted">{ROLE_OPTIONS.find((o) => o.role === role)?.hint}</p>
        </fieldset>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-4"
        noValidate
      >
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-16 pl-9"
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
          </div>
        </div>
        {error ? (
          <Notice tone="danger" title="Couldn't sign you in" live>
            {error}
          </Notice>
        ) : null}
        <Button
          ref={submitButton}
          type="submit"
          variant="primary"
          size="lg"
          loading={pending}
          className="group mt-1 shadow-(--shadow-2)"
        >
          Sign in
          {pending ? null : (
            <ArrowRight
              className="transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          )}
        </Button>
      </form>

      <DemoAccounts selectedEmail={email} onPick={pick} roles={workspaces} />
    </div>
  );
}
