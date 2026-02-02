-- CreateTable
CREATE TABLE "favorite_feeds" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "feed_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorite_feeds_user_id_idx" ON "favorite_feeds"("user_id");

-- CreateIndex
CREATE INDEX "favorite_feeds_feed_id_idx" ON "favorite_feeds"("feed_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_feeds_user_id_feed_id_key" ON "favorite_feeds"("user_id", "feed_id");

-- AddForeignKey
ALTER TABLE "favorite_feeds" ADD CONSTRAINT "favorite_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

