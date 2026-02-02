-- AlterTable: Add isFree to training_mode_configs (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'training_mode_configs' 
        AND column_name = 'is_free'
    ) THEN
        ALTER TABLE "training_mode_configs" ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Update traffic-pattern to be free
UPDATE "training_mode_configs" SET "is_free" = true WHERE "training_mode" = 'traffic-pattern';

-- CreateTable: UsageRecord
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "usage_type" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_user_id_usage_type_month_year_key" ON "usage_records"("user_id", "usage_type", "month", "year");

-- CreateIndex
CREATE INDEX "usage_records_user_id_usage_type_month_year_idx" ON "usage_records"("user_id", "usage_type", "month", "year");

