-- Fitness coach chat: the conversation rows and a feature column on the AI request log, so
-- operations sees recommendation and coach usage separately. Additive: existing log rows default
-- to RECOMMENDATION, which is what they are.

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('RECOMMENDATION', 'COACH');
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "CoachRoute" AS ENUM ('ANSWERED', 'SAFETY', 'MEDICAL', 'OUT_OF_SCOPE');

-- AlterTable
ALTER TABLE "AiRequestLog" ADD COLUMN "feature" "AiFeature" NOT NULL DEFAULT 'RECOMMENDATION';

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "route" "CoachRoute",
    "source" "RecommendationSource",
    "modelId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_customerId_createdAt_idx" ON "ChatMessage"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Content is bounded (validation caps user messages at 500 and answers at 1,500 characters).
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_content_check" CHECK (char_length("content") BETWEEN 1 AND 2000);
-- Only assistant rows carry how they were produced.
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_assistant_fields_check"
  CHECK (("role" = 'ASSISTANT') = ("route" IS NOT NULL AND "source" IS NOT NULL));
