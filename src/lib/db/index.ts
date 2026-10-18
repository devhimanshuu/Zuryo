import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getServerEnv } from "@/lib/config/env.server";
import { pgPoolConfig } from "./pool";

/**
 * One PrismaClient per server process. In development, Next.js hot reload re-evaluates modules,
 * so the instance is parked on globalThis to avoid opening a new pool on every edit.
 */
function createClient() {
  const { DATABASE_URL, NODE_ENV } = getServerEnv();
  const adapter = new PrismaPg(pgPoolConfig(DATABASE_URL));
  return new PrismaClient({ adapter, log: NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

/** The client type services accept, so tests can inject a client bound to a test database. */
export type Db = PrismaClient;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}
