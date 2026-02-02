-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "audio_s3_key" TEXT,
    "audio_url" TEXT,
    "job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "report_s3_key" TEXT,
    "report_url" TEXT,
    "summary_s3_key" TEXT,
    "summary_url" TEXT,
    "timeline_s3_key" TEXT,
    "timeline_url" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recordings_session_id_key" ON "recordings"("session_id");

-- CreateIndex
CREATE INDEX "recordings_user_id_idx" ON "recordings"("user_id");

-- CreateIndex
CREATE INDEX "recordings_session_id_idx" ON "recordings"("session_id");

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

