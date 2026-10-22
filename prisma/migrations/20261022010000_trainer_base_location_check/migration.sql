-- Fix for 20261022000000_trainer_base_location: a CHECK passes when it evaluates to NULL, so
-- "BETWEEN … AND BETWEEN …" let one coordinate be set without the other (latitude AND NULL is
-- NULL, not false). Require both explicitly. Existing rows already satisfy the stricter rule.

ALTER TABLE "TrainerProfile" DROP CONSTRAINT "TrainerProfile_base_location_check";

ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_base_location_check"
  CHECK (
    ("baseLatitude" IS NULL AND "baseLongitude" IS NULL)
    OR (
      "baseLatitude" IS NOT NULL AND "baseLongitude" IS NOT NULL
      AND "baseLatitude" BETWEEN -90 AND 90
      AND "baseLongitude" BETWEEN -180 AND 180
    )
  );
