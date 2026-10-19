-- Phase 3: package catalogue and checkout, simulated payments for bookings and packages, session
-- lifecycle bookkeeping and idempotent notifications. Additive: existing rows keep working and the
-- existing payments are backfilled with their price breakdown.

-- CreateEnum
CREATE TYPE "SessionCompletionSource" AS ENUM ('TRAINER', 'DEADLINE');

-- AlterEnum
ALTER TYPE "PackageStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "NotificationType" ADD VALUE 'SESSION_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_SUCCEEDED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'PACKAGE_PURCHASED';
ALTER TYPE "NotificationType" ADD VALUE 'PACKAGE_SESSION_REDEEMED';
ALTER TYPE "NotificationType" ADD VALUE 'PACKAGE_SESSION_RESTORED';

-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "basePrice" DECIMAL(10,2),
ADD COLUMN     "checkoutKey" TEXT,
ADD COLUMN     "commissionAmount" DECIMAL(10,2),
ADD COLUMN     "commissionPercent" DECIMAL(5,2),
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "validityDays" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "baseAmount" DECIMAL(10,2),
ADD COLUMN     "commissionAmount" DECIMAL(10,2),
ADD COLUMN     "completedAt" TIMESTAMPTZ(3),
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMPTZ(3),
ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SessionRecord" ADD COLUMN     "completionSource" "SessionCompletionSource",
ADD COLUMN     "plannedMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "paymentId" TEXT;

-- CreateTable
CREATE TABLE "PackagePlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sessionCount" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PackagePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackagePlan_slug_key" ON "PackagePlan"("slug");

-- CreateIndex
CREATE INDEX "PackagePlan_isActive_sortOrder_idx" ON "PackagePlan"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Package_checkoutKey_key" ON "Package"("checkoutKey");

-- CreateIndex
CREATE INDEX "Payment_packageId_status_idx" ON "Payment"("packageId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PackagePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ─── Hand-written backfill and constraints Prisma's schema language cannot express ───────────
-- Only enum values that existed before this migration are referenced below: PostgreSQL does not
-- allow a value added by ALTER TYPE ... ADD VALUE to be used in the same transaction.

-- Existing payments (all for bookings) get their breakdown from the booking's price snapshot, and a
-- completion time for already-decided statuses.
UPDATE "Payment" p
SET "baseAmount" = b."sessionPrice", "commissionAmount" = b."commissionAmount"
FROM "Booking" b
WHERE p."bookingId" = b."id" AND p."baseAmount" IS NULL AND p."amount" = b."totalAmount";

UPDATE "Payment" SET "completedAt" = "updatedAt"
WHERE "completedAt" IS NULL AND "status" IN ('SUCCEEDED', 'FAILED', 'REFUNDED');

-- A payment pays for exactly one thing: a booking or a package.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_target_check"
  CHECK (num_nonnulls("bookingId", "packageId") = 1);

-- amount is always base + commission when the breakdown is recorded.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_breakdown_check"
  CHECK (("baseAmount" IS NULL AND "commissionAmount" IS NULL)
      OR ("baseAmount" >= 0 AND "commissionAmount" >= 0 AND "amount" = "baseAmount" + "commissionAmount"));

-- A refund timestamp exists exactly when the payment is refunded.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_check"
  CHECK (("status" = 'REFUNDED') = ("refundedAt" IS NOT NULL));

-- At most one successful (or later refunded) payment per booking and per package: a retried or
-- concurrent checkout can never charge twice for the same thing.
CREATE UNIQUE INDEX "Payment_one_success_per_booking" ON "Payment" ("bookingId")
  WHERE "status" IN ('SUCCEEDED', 'REFUNDED');
CREATE UNIQUE INDEX "Payment_one_success_per_package" ON "Payment" ("packageId")
  WHERE "status" IN ('SUCCEEDED', 'REFUNDED');

-- Package price snapshot: total = base + commission whenever the breakdown is recorded.
ALTER TABLE "Package" ADD CONSTRAINT "Package_breakdown_check"
  CHECK ("basePrice" IS NULL OR ("commissionAmount" IS NOT NULL AND "pricePaid" = "basePrice" + "commissionAmount"));
ALTER TABLE "Package" ADD CONSTRAINT "Package_validity_check"
  CHECK ("validityDays" IS NULL OR "validityDays" > 0);

ALTER TABLE "PackagePlan" ADD CONSTRAINT "PackagePlan_values_check"
  CHECK ("sessionCount" > 0 AND "price" > 0 AND "validityDays" > 0);

-- Ledger rows say what they did: a booking debit is -1, a cancellation restore is +1.
ALTER TABLE "PackageLedgerEntry" ADD CONSTRAINT "PackageLedgerEntry_reason_delta_check"
  CHECK (("reason" = 'BOOKING_DEBIT' AND "delta" = -1)
      OR ("reason" = 'CANCELLATION_REFUND' AND "delta" = 1)
      OR "reason" = 'ADJUSTMENT');

-- The ledger is append-only: corrections are new ADJUSTMENT rows, never edits. (TRUNCATE, used only
-- by the integration-test reset, is not a row operation and is unaffected.)
CREATE FUNCTION "package_ledger_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PackageLedgerEntry is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "PackageLedgerEntry_append_only"
  BEFORE UPDATE OR DELETE ON "PackageLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "package_ledger_append_only"();

-- Session timing is fixed at start: the deadline is exactly plannedMinutes after the start, and a
-- session can't complete before it began.
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_duration_check"
  CHECK ("plannedMinutes" > 0 AND EXTRACT(EPOCH FROM ("endsAt" - "startedAt")) = "plannedMinutes" * 60);
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_completion_check"
  CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt");
