-- AI request metrics (Phase 6): observed latency and provider-reported token usage per
-- recommendation attempt, so cost and latency figures come from recorded calls rather than guesses.
-- Additive and nullable: existing rows stay valid and older code ignores the new columns.

-- AlterTable
ALTER TABLE "AiRequestLog" ADD COLUMN "latencyMs" INTEGER,
ADD COLUMN "inputTokens" INTEGER,
ADD COLUMN "outputTokens" INTEGER;
