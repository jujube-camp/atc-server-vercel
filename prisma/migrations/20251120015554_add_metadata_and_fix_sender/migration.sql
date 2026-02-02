-- AlterTable: Add metadata column with default value
ALTER TABLE "transmission_events" ADD COLUMN IF NOT EXISTS "metadata" TEXT NOT NULL DEFAULT '{}';

-- AlterTable: Change sender column type safely by casting existing data
ALTER TABLE "transmission_events" ALTER COLUMN "sender" TYPE TEXT USING "sender"::TEXT;
