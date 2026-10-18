import type { PoolConfig } from "pg";

/**
 * `pg` pool settings shared by the app, the seed script and the integration tests.
 *
 * pg closes idle connections after 10 s by default. Opening a new one to a distant Neon region costs
 * 2–3 s (TCP + TLS + SCRAM), against ~0.3 s for a query on a warm connection, so a booking flow
 * where the customer pauses between clicks would pay that handshake on almost every step. Keeping
 * a few connections warm for five minutes removes it; Neon's pooler is built for long-lived clients.
 */
export function pgPoolConfig(connectionString: string): PoolConfig {
  return {
    connectionString,
    max: 10,
    idleTimeoutMillis: 5 * 60_000,
    keepAlive: true,
    connectionTimeoutMillis: 15_000,
  };
}
