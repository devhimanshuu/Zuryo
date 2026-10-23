import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/validation/enums";

/** Session/JWT augmentation: every session carries the user's id and role from the JWT token. */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** True for a Google sign-in that hasn't picked a role yet (no account exists). */
      pending?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: Role;
    pending?: boolean;
  }
}
