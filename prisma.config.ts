import "dotenv/config";
import { defineConfig } from "prisma/config";

// With a config file present Prisma no longer reads .env on its own, hence the dotenv import.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
