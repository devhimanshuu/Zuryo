import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/validation/enums";

/**
 * Edge-safe NextAuth configuration shared by the route handler and the middleware. It contains no
 * Prisma, no bcrypt and no Node-only imports, so it can run in the middleware runtime.
 * The credentials provider itself (which does talk to the database) lives in `./index.ts`.
 */

const ROLE_PREFIX: Record<Role, string> = {
  CUSTOMER: "/customer",
  TRAINER: "/trainer",
  OPERATIONS: "/operations",
};

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id as string;
        token.role = (user as { role?: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.role = token.role as Role;
      return session;
    },
    /**
     * Route protection by role. Runs on every matched middleware request:
     *  - unauthenticated → redirect to /sign-in (callbackUrl preserved)
     *  - signed in and visiting /sign-in → their own workspace
     *  - signed in but the path belongs to another role → their own workspace
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const user = auth?.user;
      if (pathname === "/sign-in") {
        if (user?.role) return Response.redirect(new URL(ROLE_PREFIX[user.role], request.nextUrl));
        return true;
      }
      if (!user?.role) return false;
      const required = (Object.keys(ROLE_PREFIX) as Role[]).find(
        (r) => pathname === ROLE_PREFIX[r] || pathname.startsWith(`${ROLE_PREFIX[r]}/`),
      );
      if (!required) return true;
      if (user.role !== required) return Response.redirect(new URL(ROLE_PREFIX[user.role], request.nextUrl));
      return true;
    },
  },
} satisfies NextAuthConfig;
