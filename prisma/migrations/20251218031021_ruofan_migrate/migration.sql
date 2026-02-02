-- AlterTable
ALTER TABLE "auth_sessions" ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_active_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tier_limit_configs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "active_device_updated_at" SET DATA TYPE TIMESTAMP(3);
