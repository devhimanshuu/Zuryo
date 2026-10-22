-- Simulated trainer location: the point a trainer sets out from for a session. Matching ranks
-- nearer trainers first and checks that an instant session is reachable in time; customers see the
-- distance and an estimated arrival. Only derived figures (km, minutes) ever leave the server.
-- Additive and nullable: existing rows stay valid, older code ignores the columns, and a trainer
-- without a location is still matched by community exactly as before.

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN "baseLatitude" DECIMAL(9,6),
ADD COLUMN "baseLongitude" DECIMAL(9,6);

-- Both coordinates or neither, and only valid ones.
ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_base_location_check"
  CHECK (
    ("baseLatitude" IS NULL AND "baseLongitude" IS NULL)
    OR ("baseLatitude" BETWEEN -90 AND 90 AND "baseLongitude" BETWEEN -180 AND 180)
  );
