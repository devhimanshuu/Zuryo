import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import { authConfig } from "./auth.config";
import { authenticateWithAppDb, type CredentialsInput } from "./credentials";
import { googleCredentials } from "./google";

/**
 * Full NextAuth configuration (Node runtime). The credentials provider talks to the database
 * through `./credentials` (verification is split out so it can be integration-tested without
 * importing NextAuth). Sessions are signed JWTs; the user id and role ride in the token.
 *
 * Google sign-in is optional (it needs the client id and secret). A verified Google email that
 * matches an active customer or trainer signs that account in. An unknown email gets a session
 * flagged `pending` with no role, which can do nothing except finish registering at
 * /sign-up/complete. Operators never sign in through Google.
 */

const google = googleCredentials();
const lookup = (email: string) =>
  getDb().user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, role: true, status: true },
  });

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
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
    ...(google ? [Google(google)] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      // Only a Google-verified address may be matched to an account.
      if (!profile?.email || profile.email_verified !== true) return "/sign-in?error=google-unverified";
      const existing = await lookup(profile.email);
      if (existing && (existing.status !== "ACTIVE" || existing.role === "OPERATIONS")) {
        return "/sign-in?error=google-not-allowed";
      }
      return true;
    },
    async jwt({ token, user, account, profile, trigger }) {
      const googleLogin = account?.provider === "google";
      if (googleLogin || (trigger === "update" && token.pending)) {
        const email = (googleLogin ? profile?.email : token.email) ?? "";
        const existing = email ? await lookup(email) : null;
        if (existing && existing.status === "ACTIVE" && existing.role !== "OPERATIONS") {
          token.userId = existing.id;
          token.role = existing.role;
          token.name = existing.name;
          token.email = email.toLowerCase();
          token.pending = false;
        } else {
          token.userId = undefined;
          token.role = undefined;
          token.email = email.toLowerCase();
          if (googleLogin && profile?.name) token.name = profile.name;
          token.pending = true;
        }
        return token;
      }
      if (user) {
        token.userId = user.id as string;
        token.role = (user as { role?: typeof token.role }).role;
      }
      return token;
    },
  },
});
