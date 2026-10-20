import { e2eDb, resetAndSeedE2E } from "./fixtures";

/**
 * Prepares the disposable test database for the browser suite: applies no migrations (the vitest
 * integration suite does that), just truncates and re-seeds the E2E world.
 */
export default async function globalSetup() {
  const db = e2eDb();
  try {
    await resetAndSeedE2E(db);
  } finally {
    await db.$disconnect();
  }
}
