-- CreateTable: tier_limit_configs
-- This table stores usage limit configurations for each membership tier
-- Allows dynamic configuration of limits without code changes

CREATE TABLE "tier_limit_configs" (
  "id" TEXT NOT NULL,
  "tier" "MembershipTier" NOT NULL,
  "max_training_sessions" INTEGER,
  "max_recording_analyses" INTEGER,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tier_limit_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tier_limit_configs_tier_key" ON "tier_limit_configs"("tier");

-- Insert default configurations
INSERT INTO "tier_limit_configs" ("id", "tier", "max_training_sessions", "max_recording_analyses", "description", "created_at", "updated_at")
VALUES 
  (
    'cldefault_free',
    'FREE',
    NULL,
    1,
    'Free tier: unlimited training sessions, 1 recording analysis',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cldefault_premium',
    'PREMIUM',
    NULL,
    NULL,
    'Premium tier: unlimited training sessions and recording analyses',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
