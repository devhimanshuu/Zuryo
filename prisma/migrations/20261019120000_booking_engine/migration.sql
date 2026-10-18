-- Phase 2: booking engine. Additive and backward-compatible: new nullable columns, a new enum and
-- database-level overlap protection. Existing rows keep working unchanged.

-- CreateEnum
CREATE TYPE "WorkoutCategory" AS ENUM ('STRENGTH', 'YOGA', 'CARDIO', 'FUNCTIONAL', 'MOBILITY');

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN     "workoutCategories" "WorkoutCategory"[] DEFAULT ARRAY[]::"WorkoutCategory"[];

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "customerNotes" TEXT,
ADD COLUMN     "workoutCategory" "WorkoutCategory";

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Hand-written constraints Prisma's schema language cannot express ───────────

-- Customer notes stay short (the app validates the same limit with Zod).
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customer_notes_length_check" CHECK (char_length("customerNotes") <= 500);

-- No double booking, enforced by Postgres itself. Two active bookings for the same trainer (or the
-- same customer) may not have overlapping [startAt, endAt) ranges. Ranges are half-open, so a
-- 10:00–11:00 session and an 11:00–12:00 session are allowed back to back. Cancelled, completed and
-- failed bookings are outside the predicate, so cancelling a booking releases its slot immediately.
-- btree_gist provides the GiST "=" operator class for the text id columns.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_trainer_no_overlap"
  EXCLUDE USING gist ("trainerId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("trainerId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customer_no_overlap"
  EXCLUDE USING gist ("customerId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
