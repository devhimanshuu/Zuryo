"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/features/auth/google-button";
import { PASSWORD_RULES } from "@/lib/validation/auth";
import { updatePasswordAction } from "@/server/actions/account";

type Field = "currentPassword" | "newPassword" | "confirmPassword";

/**
 * Set a password (Google sign-ups have none) or change it.
 *  - `fresh`: this session did a Google sign-in in the last few minutes (the server re-checks).
 *  - Setting a first password needs `fresh`; otherwise the form asks for a Google re-check.
 *  - Changing needs the current password, or `fresh` for a forgotten one.
 */
export function PasswordForm({
  hasPassword,
  fresh,
  googleEnabled,
  returnTo,
}: {
  hasPassword: boolean;
  fresh: boolean;
  googleEnabled: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsGoogle = !hasPassword && !fresh;
  const usesCurrent = hasPassword && !(forgot && fresh);

  function submit() {
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await updatePasswordAction({
          currentPassword: usesCurrent ? current : undefined,
          newPassword: next,
          confirmPassword: confirm,
        });
        if (!res.ok) {
          const fieldErrors: Partial<Record<Field, string>> = {};
          for (const [k, msgs] of Object.entries(res.error.fieldErrors ?? {}))
            fieldErrors[k as Field] = msgs[0];
          setErrors(fieldErrors);
          setFormError(Object.keys(fieldErrors).length ? null : res.error.message);
          return;
        }
        toast.success(
          res.data.hadPassword ? "Password changed" : "Password set. You can now sign in with it.",
        );
        setCurrent("");
        setNext("");
        setConfirm("");
        setForgot(false);
        router.refresh();
      } catch {
        setFormError("We couldn't save your password. Check your connection and try again.");
      }
    });
  }

  if (needsGoogle) {
    return (
      <div className="grid gap-4">
        <Notice tone="info" title="Confirm it's you first">
          You signed up with Google, so there&apos;s no password yet. To protect your account, sign in with
          Google once more, then come back here to choose one.
        </Notice>
        {googleEnabled ? (
          <GoogleButton reauth callbackUrl={returnTo} label="Verify with Google" />
        ) : (
          <p className="text-body-sm text-ink-muted">Google sign-in isn&apos;t available right now.</p>
        )}
      </div>
    );
  }

  const field = (id: Field, label: string, value: string, set: (v: string) => void, auto: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={auto}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `${id}-error` : undefined}
      />
      {errors[id] ? (
        <p id={`${id}-error`} role="alert" className="text-body-sm text-danger">
          {errors[id]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-4"
      noValidate
    >
      {!hasPassword ? (
        <Notice tone="success" title="Google verified">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4" aria-hidden /> Choose a password to also sign in with your email.
          </span>
        </Notice>
      ) : forgot && fresh ? (
        <Notice tone="success" title="Google verified">
          You can choose a new password without the old one.
        </Notice>
      ) : null}

      {usesCurrent
        ? field("currentPassword", "Current password", current, setCurrent, "current-password")
        : null}
      {field("newPassword", hasPassword ? "New password" : "Password", next, setNext, "new-password")}
      <p className="-mt-2 text-body-sm text-ink-muted">
        At least {PASSWORD_RULES.min} characters with a letter and a number.
      </p>
      {field("confirmPassword", "Confirm password", confirm, setConfirm, "new-password")}

      <label className="flex items-center gap-2 text-body-sm text-ink-muted">
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
          className="size-4"
        />
        Show passwords
      </label>

      {formError ? (
        <Notice tone="danger" title="Couldn't save your password" live>
          {formError}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={pending}>
          <KeyRound aria-hidden /> {hasPassword ? "Change password" : "Set password"}
        </Button>
        {hasPassword && !fresh && googleEnabled ? (
          <span className="text-body-sm text-ink-muted">
            Forgot it? <GoogleLink returnTo={returnTo} />
          </span>
        ) : null}
        {hasPassword && fresh ? (
          <button
            type="button"
            onClick={() => setForgot((v) => !v)}
            className="text-body-sm font-semibold text-brand hover:underline"
          >
            {forgot ? "I remember my password" : "I forgot my password"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function GoogleLink({ returnTo }: { returnTo: string }) {
  return (
    <span className="inline-block align-middle">
      <GoogleButton reauth callbackUrl={returnTo} label="Verify with Google to reset" />
    </span>
  );
}
