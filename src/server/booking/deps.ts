import "server-only";
import type { Prisma } from "@prisma/client";
import { getDb, type Db } from "@/lib/db";

/** A client or an open interactive transaction; read helpers accept either. */
export type DbOrTx = Db | Prisma.TransactionClient;

/**
 * Everything the booking services depend on, injected so integration tests can bind a test
 * database and a fixed clock. `tx` bounds interactive transactions: `maxWait` covers acquiring a
 * pooled connection (a cold TLS connection to a distant Neon region can take seconds), `timeout`
 * caps how long one transaction, including waiting on the trainer row lock, may run.
 */
export type BookingDeps = {
  db: Db;
  now: () => Date;
  tx: { maxWait: number; timeout: number };
};

export const DEFAULT_TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

export function defaultDeps(): BookingDeps {
  return { db: getDb(), now: () => new Date(), tx: DEFAULT_TX_OPTIONS };
}
