"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { roleSchema } from "@/lib/validation/enums";
import { PERSONA_COOKIE } from "@/server/auth/actor";
import type { ServiceResult } from "@/server/booking/errors";
import { runAction } from "./run";

const switchSchema = z.object({ role: roleSchema, userId: z.string().trim().min(1).max(40) }).strict();

/**
 * Demo-only: choose which seeded user a workspace acts as. This is a convenience for exploring the
 * product, not authentication; see src/server/auth/actor.ts.
 */
export async function switchPersonaAction(input: unknown): Promise<ServiceResult<{ name: string }>> {
  return runAction("demo:switch-persona", async () => {
    const parsed = switchSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Choose a demo user." } };
    const { role, userId } = parsed.data;
    const user = await getDb().user.findFirst({
      where: { id: userId, role, status: "ACTIVE" },
      select: { name: true },
    });
    if (!user) return { ok: false, error: { code: "NOT_FOUND", message: "That demo user doesn't exist." } };
    (await cookies()).set(PERSONA_COOKIE[role], userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    revalidatePath("/", "layout");
    return { ok: true, data: { name: user.name } };
  });
}
