-- AlterTable
ALTER TABLE "liveatc_feeds" ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;

-- Update KSJC feeds to be free
UPDATE "liveatc_feeds" SET "is_free" = true;

