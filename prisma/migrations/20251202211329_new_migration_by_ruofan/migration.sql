-- AlterTable
ALTER TABLE "aircraft_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "training_mode_configs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "init_radio_type" DROP NOT NULL,
ALTER COLUMN "init_radio_type" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;
