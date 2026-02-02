-- Replace has_reached_cruising with active_airport_icao
-- has_reached_cruising was used to determine which airport to use for VFR flights
-- active_airport_icao directly stores the current airport being used

-- Add active_airport_icao column
ALTER TABLE "sessions" ADD COLUMN "active_airport_icao" TEXT;

-- Drop has_reached_cruising column
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "has_reached_cruising";

