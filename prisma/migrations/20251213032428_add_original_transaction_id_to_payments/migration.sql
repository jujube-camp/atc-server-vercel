-- AlterTable: Add original_transaction_id to payments
-- First, add the column as nullable
ALTER TABLE "payments" ADD COLUMN "original_transaction_id" TEXT;

-- Backfill existing records: for existing payments, original_transaction_id = transaction_id
UPDATE "payments" SET "original_transaction_id" = "transaction_id" WHERE "original_transaction_id" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "payments" ALTER COLUMN "original_transaction_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "payments_original_transaction_id_idx" ON "payments"("original_transaction_id");
