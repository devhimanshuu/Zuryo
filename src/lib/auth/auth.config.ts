import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/validation/enums";
import { safeCallbackUrl } from "./callback-url";

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
  // Provider errors (a cancelled Google consent, say) come back to the sign-in page as ?error=.
  pages: { signIn: "/sign-in", error: "/sign-in" },
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
      session.user.pending = token.pending === true;
      session.user.authAt = token.authAt as number | undefined;
      session.user.authMethod = token.authMethod as "password" | "google" | undefined;
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
      // A Google sign-in with no account yet may only finish registering (or go back to sign in).
      if (user?.pending) {
        if (["/sign-up/complete", "/sign-in", "/sign-up"].includes(pathname)) return true;
        return Response.redirect(new URL("/sign-up/complete", request.nextUrl));
      }
      if (pathname === "/sign-up/complete") {
        if (!user?.role) return Response.redirect(new URL("/sign-in", request.nextUrl));
        // Existing Google users land here after the OAuth round trip; send them on their way.
        const next = safeCallbackUrl(
          request.nextUrl.searchParams.get("next") ?? undefined,
          user.role,
          request.nextUrl.origin,
        );
        return Response.redirect(new URL(next ?? ROLE_PREFIX[user.role], request.nextUrl));
      }
      if (pathname === "/sign-in" || pathname === "/sign-in/operator" || pathname === "/sign-up") {
        if (user?.role) return Response.redirect(new URL(ROLE_PREFIX[user.role], request.nextUrl));
        return true;
      }
      if (!user?.role) {
        // Operations staff land on their own sign-in page, everyone else on the main one.
        if (pathname === ROLE_PREFIX.OPERATIONS || pathname.startsWith(`${ROLE_PREFIX.OPERATIONS}/`)) {
          const to = new URL("/sign-in/operator", request.nextUrl);
          to.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
          return Response.redirect(to);
        }
        return false;
      }
      const required = (Object.keys(ROLE_PREFIX) as Role[]).find(
        (r) => pathname === ROLE_PREFIX[r] || pathname.startsWith(`${ROLE_PREFIX[r]}/`),
      );
      if (!required) return true;
      if (user.role !== required) return Response.redirect(new URL(ROLE_PREFIX[user.role], request.nextUrl));
      return true;
    },
  },
} satisfies NextAuthConfig;
