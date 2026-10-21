"use client";

import { KeyRound, TriangleAlert } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_PASSWORD } from "@/lib/auth/demo-password";
import { roleForCallback, safeCallbackUrl } from "@/lib/auth/callback-url";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";

const ROLE_OPTIONS: Array<{ role: Role; label: string; hint: string }> = [
  { role: "CUSTOMER", label: "Customer", hint: "Book sessions, packages and fitness" },
  { role: "TRAINER", label: "Trainer", hint: "Sessions, availability and your schedule" },
  { role: "OPERATIONS", label: "Operations", hint: "Bookings, pricing and oversight" },
];

/** Seeded demo accounts (see prisma/seed-data.ts). All share one demo password. */
const CALLBACK_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const DEMO_ACCOUNTS: Array<{ role: Role; name: string; email: string }> = [
  { role: "CUSTOMER", name: "Priya Sharma", email: "priya.sharma@demo.zuryo.example" },
  { role: "CUSTOMER", name: "Rahul Verma", email: "rahul.verma@demo.zuryo.example" },
  { role: "CUSTOMER", name: "Farhan Qureshi", email: "farhan.qureshi@demo.zuryo.example" },
  { role: "TRAINER", name: "Arjun Mehta", email: "arjun.mehta@demo.zuryo.example" },
  { role: "TRAINER", name: "Kavya Rao", email: "kavya.rao@demo.zuryo.example" },
  { role: "OPERATIONS", name: "Neha Kapoor", email: "neha.kapoor@demo.zuryo.example" },
];

/** Email + password sign-in. Credentials go only to the NextAuth credentials endpoint. */
export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(() => roleForCallback(callbackUrl, CALLBACK_ORIGIN) ?? "CUSTOMER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      const callbackRole = roleForCallback(callbackUrl, CALLBACK_ORIGIN);
      const effectiveRole = callbackRole ?? role;
      const destination = safeCallbackUrl(callbackUrl, effectiveRole, CALLBACK_ORIGIN) ?? ROLE_HOME[effectiveRole];
      router.push(destination);
      router.refresh();
    });
  }

  const pick = (accountRole: Role, accountEmail: string) => {
    setRole(accountRole);
    setEmail(accountEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-1.5">
        <legend className="font-semibold">Workspace</legend>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-sunken p-1">
          {ROLE_OPTIONS.map((o) => (
            <label
              key={o.role}
              className={cn(
                "relative flex min-h-11 cursor-pointer items-center justify-center rounded-sm px-2 py-1.5 text-sm font-semibold transition-colors",
                role === o.role ? "bg-raised text-ink shadow-(--shadow-1)" : "text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="workspace"
                value={o.role}
                checked={role === o.role}
                onChange={() => setRole(o.role)}
                className="peer sr-only"
              />
              <span>{o.label}</span>
              <span className="pointer-events-none absolute inset-0 rounded-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus" />
            </label>
          ))}
        </div>
        <p className="text-body-sm text-ink-muted">{ROLE_OPTIONS.find((o) => o.role === role)?.hint}</p>
      </fieldset>

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
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <Notice tone="danger" title="Couldn't sign you in" live>
            {error}
          </Notice>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          <KeyRound aria-hidden /> Sign in
        </Button>
      </form>

      <div className="grid gap-2 rounded-md bg-info-soft p-3 text-body-sm text-info">
        <p className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Demo database.</strong> Seeded accounts share password{" "}
            <code className="font-semibold">{DEMO_PASSWORD}</code>.
          </span>
        </p>
        <details className="group border-t border-info/15 pt-2">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold underline decoration-info/40 underline-offset-2 hover:decoration-info">
            Choose a seeded account
          </summary>
          <ul className="grid gap-1">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => pick(a.role, a.email)}
                  className="min-h-11 w-full rounded-sm px-2 py-1.5 text-left font-semibold hover:bg-info/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {a.name} · {a.role.toLowerCase()}
                  <span className="block truncate text-xs font-normal opacity-80">{a.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
