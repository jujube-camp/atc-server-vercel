-- Add has_reached_cruising flag to sessions for VFR cruise tracking
ALTER TABLE "sessions"
ADD COLUMN "has_reached_cruising" BOOLEAN NOT NULL DEFAULT false;
