-- Authentication (Phase 5): credentials sign-in for the existing User model. Additive: every
-- existing row keeps working (the seed backfills a demo password hash below via the app seed).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
