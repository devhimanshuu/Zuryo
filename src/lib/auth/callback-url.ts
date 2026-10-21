import type { Role } from "@/lib/validation/enums";

const ROLE_PREFIX: Record<Role, string> = {
  CUSTOMER: "/customer",
  TRAINER: "/trainer",
  OPERATIONS: "/operations",
};

function parseCallback(value: string | undefined, origin: string): URL | null {
  if (!value || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
}

/** Identifies the role workspace of a same-origin callback without trusting arbitrary URLs. */
export function roleForCallback(value: string | undefined, origin: string): Role | null {
  const url = parseCallback(value, origin);
  if (!url) return null;
  return (
    (Object.entries(ROLE_PREFIX) as Array<[Role, string]>).find(
      ([, prefix]) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
    )?.[0] ?? null
  );
}

/** Returns only same-origin paths inside the authenticated role's workspace. */
export function safeCallbackUrl(value: string | undefined, role: Role, origin: string): string | null {
  const url = parseCallback(value, origin);
  if (!url) return null;
  const prefix = ROLE_PREFIX[role];
  return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
    ? `${url.pathname}${url.search}${url.hash}`
    : null;
}
