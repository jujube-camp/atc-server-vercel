-- Add trial days columns to membership_plans table
ALTER TABLE "membership_plans" ADD COLUMN "monthly_trial_days" INTEGER;
ALTER TABLE "membership_plans" ADD COLUMN "yearly_trial_days" INTEGER;

-- Update existing PREMIUM plan with default 3-day trial
UPDATE "membership_plans"
SET "monthly_trial_days" = 3, "yearly_trial_days" = 3
WHERE "tier" = 'PREMIUM';
