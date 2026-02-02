-- Add flight data fields to recordings table
ALTER TABLE "recordings" ADD COLUMN "flight_data_s3_key" TEXT;
ALTER TABLE "recordings" ADD COLUMN "flight_data_url" TEXT;

