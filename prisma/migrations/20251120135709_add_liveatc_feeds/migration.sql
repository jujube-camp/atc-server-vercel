-- CreateTable
CREATE TABLE "liveatc_feeds" (
    "id" TEXT NOT NULL,
    "mount" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icao" TEXT NOT NULL,
    "pls_url" TEXT NOT NULL,
    "stream_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liveatc_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "liveatc_feeds_icao_idx" ON "liveatc_feeds"("icao");

-- CreateIndex
CREATE INDEX "liveatc_feeds_mount_idx" ON "liveatc_feeds"("mount");

-- CreateIndex
CREATE UNIQUE INDEX "liveatc_feeds_icao_mount_key" ON "liveatc_feeds"("icao", "mount");

