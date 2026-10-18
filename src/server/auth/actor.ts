import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb, type Db } from "@/lib/db";
import type { Role } from "@/lib/validation/enums";
import { DEMO_PERSONAS } from "@/server/demo";

/**
 * DEMO IDENTITY, NOT AUTHENTICATION.
 *
 * There is no sign-in yet. Each workspace acts as a seeded user chosen with the demo persona picker,
 * remembered in a cookie per role. The cookie is not signed and anyone can change it, so this proves
 * the authorisation *paths* (every service checks that the actor owns what it touches), not
 * security. Replacing `getActor` with a real session lookup is the only change auth needs.
 */
export type Actor = { userId: string; role: Role; name: string };

export const PERSONA_COOKIE: Record<Role, string> = {
  CUSTOMER: "zuryo_demo_customer",
  TRAINER: "zuryo_demo_trainer",
  OPERATIONS: "zuryo_demo_operations",
};

/** The requested user if they exist, are active and hold the role; otherwise the default persona. */
export async function resolveActor(db: Db, role: Role, requestedUserId: string | undefined): Promise<Actor> {
  const fallback: Actor = { ...DEMO_PERSONAS[role], role };
  if (!requestedUserId || requestedUserId === fallback.userId) return fallback;
  const user = await db.user.findFirst({
    where: { id: requestedUserId, role, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  return user ? { userId: user.id, name: user.name, role } : fallback;
}

/** The acting user for a workspace in this request. Memoised per request. */
export const getActor = cache(async (role: Role): Promise<Actor> => {
  const requested = (await cookies()).get(PERSONA_COOKIE[role])?.value;
  try {
    return await resolveActor(getDb(), role, requested);
  } catch (err) {
    // Database unreachable: fall back so the shell renders; the page shows its own error state.
    console.error("[actor]", err instanceof Error ? err.message : err);
    return { ...DEMO_PERSONAS[role], role };
  }
});

export type Persona = { userId: string; name: string; detail: string | null };

/** Seeded users the demo picker can switch between for a role. */
export const listPersonas = cache(async (role: Role): Promise<Persona[]> => {
  try {
    const users = await getDb().user.findMany({
      where: { role, status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 12,
      select: {
        id: true,
        name: true,
        customerProfile: { select: { serviceZone: { select: { name: true } } } },
        trainerProfile: { select: { serviceZone: { select: { name: true } } } },
      },
    });
    return users.map((u) => ({
      userId: u.id,
      name: u.name,
      detail: u.customerProfile?.serviceZone.name ?? u.trainerProfile?.serviceZone.name ?? null,
    }));
  } catch {
    return [];
  }
});
