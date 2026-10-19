import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authenticateWithAppDb, type CredentialsInput } from "./credentials";

/**
 * Full NextAuth configuration (Node runtime). The credentials provider talks to the database
 * through `./credentials` (verification is split out so it can be integration-tested without
 * importing NextAuth). Sessions are signed JWTs; the user id and role ride in the token.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        role: { label: "Workspace" },
      },
      authorize: (credentials) => authenticateWithAppDb((credentials ?? {}) as CredentialsInput),
    }),
  ],
});
