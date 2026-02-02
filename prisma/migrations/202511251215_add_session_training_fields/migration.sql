-- Add training mode and radio frequency columns to sessions
ALTER TABLE "sessions" ADD COLUMN "trainingMode" TEXT;
ALTER TABLE "sessions" ADD COLUMN "radioFrequency1" TEXT;

