-- Add device management fields to users table
ALTER TABLE "users" ADD COLUMN "active_device_id" TEXT;
ALTER TABLE "users" ADD COLUMN "active_device_name" TEXT;
ALTER TABLE "users" ADD COLUMN "active_device_updated_at" TIMESTAMP;
ALTER TABLE "users" ADD COLUMN "push_token" TEXT;

-- Add device info fields to payments table
ALTER TABLE "payments" ADD COLUMN "device_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "device_name" TEXT;
ALTER TABLE "payments" ADD COLUMN "device_model" TEXT;

-- Create auth_sessions table for managing user login sessions
CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "device_name" TEXT,
  "device_model" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "refresh_token" TEXT,
  "refresh_token_expires_at" TIMESTAMP,
  "last_active_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- Create indexes for auth_sessions
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");
CREATE INDEX "auth_sessions_device_id_idx" ON "auth_sessions"("device_id");
CREATE INDEX "auth_sessions_is_active_idx" ON "auth_sessions"("is_active");
CREATE INDEX "auth_sessions_refresh_token_idx" ON "auth_sessions"("refresh_token");

-- Create indexes for users device fields
CREATE INDEX "users_active_device_id_idx" ON "users"("active_device_id");
CREATE INDEX "users_push_token_idx" ON "users"("push_token");

-- Add foreign key constraint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
