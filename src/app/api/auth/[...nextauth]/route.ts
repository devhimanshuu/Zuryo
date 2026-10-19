import { handlers } from "@/lib/auth";

/** NextAuth v5 route handler: /api/auth/signin, /signout, /session, /csrf, /callback/credentials… */
export const { GET, POST } = handlers;
