"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/validation/enums";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import type { ServiceResult } from "@/server/booking/errors";
import { markAllRead } from "@/server/notifications/notification-service";
import { runAction } from "./run";

async function markRead(role: Role): Promise<ServiceResult<{ marked: number }>> {
  return runAction(`notifications:read:${role}`, async () => {
    const deps = defaultDeps();
    const actor = await getActor(role);
    const marked = await markAllRead(deps.db, actor.userId, deps.now());
    revalidatePath("/", "layout");
    return { ok: true, data: { marked } };
  });
}

/* One action per workspace, so the acting user always comes from that workspace's own identity. */

export async function markCustomerNotificationsReadAction(): Promise<ServiceResult<{ marked: number }>> {
  return markRead("CUSTOMER");
}

export async function markTrainerNotificationsReadAction(): Promise<ServiceResult<{ marked: number }>> {
  return markRead("TRAINER");
}
