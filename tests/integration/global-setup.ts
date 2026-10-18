import "dotenv/config";
import { execSync } from "node:child_process";

function target(url: string) {
  const u = new URL(url);
  return { host: u.hostname.replace("-pooler", ""), database: u.pathname.replace(/^\//, "") };
}

/**
 * Applies the real migrations to the test database before the suite runs. Refuses to run unless
 * TEST_DATABASE_URL points at a database whose name contains "test" and which is not the app's own
 * database, because every test TRUNCATEs all tables.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests need a separate, disposable Postgres database " +
        "(they TRUNCATE every table). See README → Testing.",
    );
  }
  const test = target(url);
  if (!/test/i.test(test.database)) {
    throw new Error(`Refusing to run: TEST_DATABASE_URL database "${test.database}" must contain "test".`);
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const other = process.env[name];
    if (other && target(other).host === test.host && target(other).database === test.database) {
      throw new Error(`Refusing to run: TEST_DATABASE_URL points at the same database as ${name}.`);
    }
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: process.env.TEST_DIRECT_URL ?? url },
  });
}
