import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

/**
 * Route protection for the three workspaces. The role checks live in the `authorized` callback in
 * auth.config.ts; this middleware only verifies the JWT and applies them.
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/customer/:path*", "/trainer/:path*", "/operations/:path*", "/sign-in"],
};
