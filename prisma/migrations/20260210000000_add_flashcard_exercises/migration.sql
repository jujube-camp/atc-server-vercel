-- CreateTable
CREATE TABLE "flashcard_exercises" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flashcard_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flashcard_exercises_topic_idx" ON "flashcard_exercises"("topic");
