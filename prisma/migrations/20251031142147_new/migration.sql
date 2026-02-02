-- CreateEnum
CREATE TYPE "EventSender" AS ENUM ('PILOT', 'ATC');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "username" TEXT,
    "appleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "referral_code" TEXT,
    "referred_by_referral_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "airportIcao" TEXT NOT NULL,
    "aircraftTailNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentPhaseName" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "previous_response_id" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmission_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sender" "EventSender" NOT NULL,
    "current_phase" TEXT NOT NULL,
    "audio_url" TEXT,
    "audio_transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transmission_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_advance_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "from_phase" TEXT NOT NULL,
    "to_phase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_advance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "transmissionEventId" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,
    "exampleAnswer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "id" TEXT NOT NULL,
    "ident" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude_deg" DOUBLE PRECISION,
    "longitude_deg" DOUBLE PRECISION,
    "elevation_ft" TEXT,
    "continent" TEXT NOT NULL,
    "iso_country" TEXT NOT NULL,
    "iso_region" TEXT NOT NULL,
    "municipality" TEXT,
    "scheduled_service" TEXT,
    "icao_code" TEXT,
    "iata_code" TEXT,
    "gps_code" TEXT,
    "local_code" TEXT,
    "json_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_refreshToken_key" ON "users"("refreshToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "transmission_events_sessionId_idx" ON "transmission_events"("sessionId");

-- CreateIndex
CREATE INDEX "phase_advance_events_sessionId_idx" ON "phase_advance_events"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_transmissionEventId_key" ON "evaluations"("transmissionEventId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_owner_user_id_key" ON "referral_codes"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_referral_code_key" ON "referral_codes"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "airports_icao_code_key" ON "airports"("icao_code");

-- CreateIndex
CREATE INDEX "airports_icao_code_idx" ON "airports"("icao_code");

-- CreateIndex
CREATE INDEX "airports_iso_country_idx" ON "airports"("iso_country");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmission_events" ADD CONSTRAINT "transmission_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_advance_events" ADD CONSTRAINT "phase_advance_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_transmissionEventId_fkey" FOREIGN KEY ("transmissionEventId") REFERENCES "transmission_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

