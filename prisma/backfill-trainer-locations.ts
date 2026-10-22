import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { TRAINERS } from "./seed-data";
import { pgPoolConfig } from "../src/lib/db/pool";

/**
 * One-off for a database seeded before trainer locations existed: writes each seeded trainer's
 * simulated base coordinates and touches nothing else (no bookings moved, unlike re-running the full
 * seed). Idempotent. Run after `npm run db:deploy`:
 *
 *   npx tsx prisma/backfill-trainer-locations.ts
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaPg(pgPoolConfig(url)) });
  try {
    for (const t of TRAINERS) {
      const res = await db.trainerProfile.updateMany({
        where: { userId: t.id },
        data: { baseLatitude: t.base.latitude, baseLongitude: t.base.longitude },
      });
      console.log(
        `${t.name}: ${res.count === 1 ? `set to ${t.base.latitude}, ${t.base.longitude}` : "not found, skipped"}`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
