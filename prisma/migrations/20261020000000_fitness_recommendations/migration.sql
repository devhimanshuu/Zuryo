-- Phase 4: fitness profile detail, tracked fitness goals, workout recommendations and an
-- append-only AI request log. Additive only: no existing table, column or row changes.

-- New goal kinds for "consistency" and "balance" recommendations. PostgreSQL 12+ allows ADD VALUE
-- inside a transaction and use of the new values later in the same migration.
ALTER TYPE "FitnessGoal" ADD VALUE 'CONSISTENCY';
ALTER TYPE "FitnessGoal" ADD VALUE 'BALANCE';

-- CreateEnum
CREATE TYPE "WorkoutIntensity" AS ENUM ('LOW', 'MODERATE', 'HIGH');
CREATE TYPE "WorkoutEnvironment" AS ENUM ('HOME', 'OUTDOOR');
CREATE TYPE "EquipmentOption" AS ENUM ('NONE', 'MAT', 'DUMBBELLS', 'RESISTANCE_BAND', 'KETTLEBELL', 'SKIPPING_ROPE', 'STATIONARY_BIKE');
CREATE TYPE "FitnessGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED');
CREATE TYPE "RecommendationSource" AS ENUM ('AI', 'RULE_BASED');
CREATE TYPE "RecommendationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "RecommendationFeedback" AS ENUM ('USEFUL', 'NOT_USEFUL');
CREATE TYPE "AiRequestOutcome" AS ENUM ('SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "CustomerProfile" ADD COLUMN "intensity" "WorkoutIntensity",
ADD COLUMN "equipment" "EquipmentOption"[] NOT NULL DEFAULT '{}',
ADD COLUMN "environment" "WorkoutEnvironment",
ADD COLUMN "avoidExercises" TEXT,
ADD COLUMN "accommodations" TEXT,
ADD COLUMN "movementLimitations" TEXT,
ADD COLUMN "goalDetails" TEXT;

-- CreateTable
-- (Named FitnessGoalTracking because the Postgres enum "FitnessGoal" already occupies the name.)
CREATE TABLE "FitnessGoalTracking" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "goal" "FitnessGoal" NOT NULL,
    "status" "FitnessGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "target" TEXT,
    "targetDate" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FitnessGoalTracking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutRecommendation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" "RecommendationSource" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'ACTIVE',
    "goal" "FitnessGoal" NOT NULL,
    "category" "WorkoutCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "intensity" "WorkoutIntensity" NOT NULL,
    "goalSnapshot" "FitnessGoal"[] NOT NULL,
    "preferenceSnapshot" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "modelId" TEXT,
    "feedback" "RecommendationFeedback",
    "feedbackNote" TEXT,
    "feedbackAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkoutRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRequestLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" "RecommendationSource" NOT NULL,
    "outcome" "AiRequestOutcome" NOT NULL,
    "modelId" TEXT,
    "errorKind" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FitnessGoalTracking_customerId_goal_key" ON "FitnessGoalTracking"("customerId", "goal");
CREATE INDEX "FitnessGoalTracking_customerId_status_idx" ON "FitnessGoalTracking"("customerId", "status");
CREATE INDEX "WorkoutRecommendation_customerId_createdAt_idx" ON "WorkoutRecommendation"("customerId", "createdAt" DESC);
CREATE INDEX "WorkoutRecommendation_source_createdAt_idx" ON "WorkoutRecommendation"("source", "createdAt");
CREATE INDEX "AiRequestLog_createdAt_idx" ON "AiRequestLog"("createdAt");
CREATE INDEX "AiRequestLog_customerId_createdAt_idx" ON "AiRequestLog"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "FitnessGoalTracking" ADD CONSTRAINT "FitnessGoalTracking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutRecommendation" ADD CONSTRAINT "WorkoutRecommendation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequestLog" ADD CONSTRAINT "AiRequestLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written guardrails Prisma's schema language cannot express ───────

-- Session-length guardrail: recommendations are for a single 20–60 minute workout, never a marathon.
ALTER TABLE "WorkoutRecommendation" ADD CONSTRAINT "WorkoutRecommendation_duration_check"
  CHECK ("durationMinutes" BETWEEN 20 AND 60);

-- The structured payload must be a JSON object (the app validates its shape further with Zod).
ALTER TABLE "WorkoutRecommendation" ADD CONSTRAINT "WorkoutRecommendation_payload_object_check"
  CHECK (jsonb_typeof("payload") = 'object');

-- Rule-based rows never claim an AI model; AI rows always record which model produced them.
ALTER TABLE "WorkoutRecommendation" ADD CONSTRAINT "WorkoutRecommendation_model_check"
  CHECK (("source" = 'AI') = ("modelId" IS NOT NULL));

-- Same invariant on the request log: failed AI attempts keep the model id, fallbacks don't.
ALTER TABLE "AiRequestLog" ADD CONSTRAINT "AiRequestLog_model_check"
  CHECK (("source" = 'AI') = ("modelId" IS NOT NULL));
