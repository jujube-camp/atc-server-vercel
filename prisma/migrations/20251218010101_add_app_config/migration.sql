-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('FREEMIUM', 'PAYWALL');

-- CreateTable
CREATE TABLE "app_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_configs_key_key" ON "app_configs"("key");

-- Insert default payment mode
INSERT INTO "app_configs" ("id", "key", "value", "description", "created_at", "updated_at")
VALUES (
    'cuid_payment_mode',
    'payment_mode',
    'FREEMIUM',
    'Payment mode: FREEMIUM (free basic features, pay for premium) or PAYWALL (force subscription with trial before using app)',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
