"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/select";
import type { Role } from "@/lib/validation/enums";
import { switchPersonaAction } from "@/server/actions/demo";
import type { Persona } from "@/server/auth/actor";

/** Demo control: act as another seeded user in this workspace. Not authentication. */
export function PersonaPicker({
  role,
  personas,
  currentUserId,
  onSwitched,
}: {
  role: Role;
  personas: Persona[];
  currentUserId: string;
  onSwitched?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (personas.length < 2) return null;

  return (
    <label className="mt-2 block">
      <span className="sr-only">Act as demo user</span>
      <Select
        className="h-9 text-sm"
        value={currentUserId}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const userId = e.target.value;
          startTransition(async () => {
            const res = await switchPersonaAction({ role, userId });
            if (!res.ok) {
              toast.error(res.error.message);
              return;
            }
            toast.success(`Now viewing as ${res.data.name}`);
            router.refresh();
            onSwitched?.();
          });
        }}
      >
        {personas.map((p) => (
          <option key={p.userId} value={p.userId}>
            {p.name}
            {p.detail ? ` · ${p.detail}` : ""}
          </option>
        ))}
      </Select>
    </label>
  );
}
