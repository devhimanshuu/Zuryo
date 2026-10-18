import "server-only";

/**
 * Phase 1 has no authentication. Each workspace renders one seeded persona so the shell can be
 * built against real data. Phase 2 replaces these constants with the signed-in user's id.
 */
export const DEMO_PERSONAS = {
  CUSTOMER: { userId: "seed_user_priya", name: "Priya Sharma" },
  TRAINER: { userId: "seed_user_arjun", name: "Arjun Mehta" },
  OPERATIONS: { userId: "seed_user_neha", name: "Neha Kapoor" },
} as const;
