-- Add arrival_airport field to sessions for VFR flight mode
-- This allows the system to track both departure and arrival airports
-- and switch between them when the flight reaches cruising phase
ALTER TABLE "sessions"
ADD COLUMN "arrival_airport" TEXT;

