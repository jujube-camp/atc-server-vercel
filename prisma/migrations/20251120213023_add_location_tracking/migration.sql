-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "currentLocation" TEXT;

-- CreateTable
CREATE TABLE "location_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_events_sessionId_idx" ON "location_events"("sessionId");

-- AddForeignKey
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
