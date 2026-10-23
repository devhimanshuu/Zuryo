import "server-only";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/utils/errors";
import type { Role } from "@/lib/validation/enums";

/**
 * The acting user for this request, from the NextAuth session (JWT). Every server action and page
 * resolves identity through this one function, so authorization is enforced at every entry point,
 * not just where the UI shows a button. Workspace pages are additionally protected by role in
 * middleware; this check is the backstop for direct server-action calls.
 */
export type Actor = { userId: string; role: Role; name: string };

export async function getActor(role: Role): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("FORBIDDEN", "Sign in to continue.");
  }
  if (session.user.role !== role) {
    throw new AppError("FORBIDDEN", "Your account doesn't have access to this workspace.");
  }
  return { userId: session.user.id, role, name: session.user.name ?? "ZuryoFit user" };
}
