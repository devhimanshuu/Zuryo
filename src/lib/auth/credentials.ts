import "server-only";
import { compare } from "bcryptjs";
import { getDb, type Db } from "@/lib/db";
import type { Role } from "@/lib/validation/enums";

/**
 * Credential verification for the NextAuth credentials provider, kept in its own module so it can
 * be integration-tested without importing NextAuth. The database client is injected so tests can
 * bind their own database. Returns the session user or null — never the reason, so an attacker
 * can't probe which part of the credential was wrong.
 */

export type CredentialsInput = { email?: unknown; password?: unknown; role?: unknown };

export type AuthenticatedUser = { id: string; name: string; email: string; role: Role };

/** Hash of a random string, compared against when no user exists, so "unknown email" takes the
 * same bcrypt time as a wrong password and the two cases can't be told apart by timing. */
const DUMMY_HASH = "$2a$10$C6UzMDM.H6dfI/f/IKcEeO7Zk4n1y6y9l5lT6y6y6y6y6y6y6y6y6y6";

const ROLES: Role[] = ["CUSTOMER", "TRAINER", "OPERATIONS"];

export async function authenticateUser(db: Db, input: CredentialsInput): Promise<AuthenticatedUser | null> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = input.role as Role;
  if (!email || !password || !ROLES.includes(role)) return null;

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, status: true, passwordHash: true },
  });
  const matches = await compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches || user.status !== "ACTIVE" || user.role !== role) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** The provider entry point: verifies against the application database. */
export function authenticateWithAppDb(input: CredentialsInput) {
  return authenticateUser(getDb(), input);
}
