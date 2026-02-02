-- CreateTable
CREATE TABLE "session_states" (
    "sessionId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_states_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "session_states" ADD CONSTRAINT "session_states_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
