"use client";

import { KeyRound, TriangleAlert } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { cn } from "@/lib/utils/cn";

const ROLE_OPTIONS: Array<{ role: Role; label: string; hint: string }> = [
  { role: "CUSTOMER", label: "Customer", hint: "Book sessions, packages and fitness" },
  { role: "TRAINER", label: "Trainer", hint: "Sessions, availability and your schedule" },
  { role: "OPERATIONS", label: "Operations", hint: "Bookings, pricing and oversight" },
];

/** Seeded demo accounts (see prisma/seed-data.ts). All share one demo password. */
const DEMO_ACCOUNTS: Array<{ role: Role; name: string; email: string }> = [
  { role: "CUSTOMER", name: "Priya Sharma", email: "priya.sharma@demo.zuryo.example" },
  { role: "CUSTOMER", name: "Rahul Verma", email: "rahul.verma@demo.zuryo.example" },
  { role: "CUSTOMER", name: "Farhan Qureshi", email: "farhan.qureshi@demo.zuryo.example" },
  { role: "TRAINER", name: "Arjun Mehta", email: "arjun.mehta@demo.zuryo.example" },
  { role: "TRAINER", name: "Kavya Rao", email: "kavya.rao@demo.zuryo.example" },
  { role: "OPERATIONS", name: "Neha Kapoor", email: "neha.kapoor@demo.zuryo.example" },
];

export const DEMO_PASSWORD = "password123";

/** Email + password sign-in. Credentials go only to the NextAuth credentials endpoint. */
export function SignInForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("CUSTOMER");
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
      router.push(ROLE_HOME[role]);
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
        <div className="grid grid-cols-3 gap-1 rounded-md bg-sunken p-1" role="radiogroup" aria-label="Workspace">
          {ROLE_OPTIONS.map((o) => (
            <button
              key={o.role}
              type="button"
              role="radio"
              aria-checked={role === o.role}
              title={o.hint}
              onClick={() => setRole(o.role)}
              className={cn(
                "rounded-sm px-2 py-1.5 text-sm font-semibold",
                role === o.role ? "bg-raised text-ink shadow-(--shadow-1)" : "text-ink-muted hover:text-ink",
              )}
            >
              {o.label}
            </button>
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
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!email || !password}>
          <KeyRound aria-hidden /> Sign in
        </Button>
      </form>

      <div className="grid gap-3 rounded-md bg-info-soft p-3 text-body-sm text-info">
        <p className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Demo database.</strong> Every seeded account shares the demo password{" "}
            <code className="font-semibold">{DEMO_PASSWORD}</code>. Pick an account below to fill the form.
          </span>
        </p>
        <ul className="grid gap-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => pick(a.role, a.email)}
                className="w-full rounded-sm px-2 py-1.5 text-left font-semibold hover:bg-info/10"
              >
                {a.name} · {a.role.toLowerCase()}
                <span className="block truncate text-xs font-normal opacity-80">{a.email}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
