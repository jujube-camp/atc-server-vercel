-- AlterTable: Add lastResetAt to memberships
ALTER TABLE "memberships" ADD COLUMN "last_reset_at" TIMESTAMP(3);

-- CreateTable: MembershipPlan
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL,
    "monthly_price" DOUBLE PRECISION NOT NULL,
    "yearly_price" DOUBLE PRECISION NOT NULL,
    "yearly_discount" DOUBLE PRECISION NOT NULL,
    "monthly_product_id" TEXT NOT NULL,
    "yearly_product_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_tier_key" ON "membership_plans"("tier");

-- Insert default membership plans
INSERT INTO "membership_plans" (
    "id",
    "tier",
    "monthly_price",
    "yearly_price",
    "yearly_discount",
    "monthly_product_id",
    "yearly_product_id",
    "is_active",
    "updated_at"
) VALUES
(
    gen_random_uuid()::text,
    'PREMIUM',
    14.99,
    69.99,
    0.6,
    'com.aviateai.premium.monthly',
    'com.aviateai.premium.yearly',
    true,
    NOW()
);

