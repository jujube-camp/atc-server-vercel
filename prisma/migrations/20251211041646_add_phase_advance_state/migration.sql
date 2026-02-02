-- AlterTable
ALTER TABLE "phase_advance_events" ADD COLUMN     "env_data" JSONB NOT NULL DEFAULT '{}';
