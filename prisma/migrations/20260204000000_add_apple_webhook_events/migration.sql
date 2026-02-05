-- CreateTable
CREATE TABLE "apple_webhook_events" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "notification_type" TEXT,
    "notification_uuid" TEXT,
    "environment" TEXT,
    "signed_payload" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "original_transaction_id" TEXT,
    "transaction_id" TEXT,
    "product_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "apple_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "apple_webhook_events_notification_uuid_idx" ON "apple_webhook_events"("notification_uuid");

-- CreateIndex
CREATE INDEX "apple_webhook_events_original_transaction_id_idx" ON "apple_webhook_events"("original_transaction_id");

-- CreateIndex
CREATE INDEX "apple_webhook_events_transaction_id_idx" ON "apple_webhook_events"("transaction_id");
