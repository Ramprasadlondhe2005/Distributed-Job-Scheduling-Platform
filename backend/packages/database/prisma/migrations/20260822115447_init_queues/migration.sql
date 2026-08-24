-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "queues" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 5,
    "status" "QueueStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "queues_projectId_name_key" ON "queues"("projectId", "name");

-- AddForeignKey for queues -> projects
ALTER TABLE "queues" ADD CONSTRAINT "queues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Create a default queue for every existing project
INSERT INTO "queues" ("id", "projectId", "name", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'Default Queue', NOW()
FROM "projects";

-- Add queueId column to jobs (initially nullable to avoid constraint errors)
ALTER TABLE "jobs" ADD COLUMN "queueId" TEXT;

-- Update existing jobs to use the default queue of their project
UPDATE "jobs" j
SET "queueId" = q."id"
FROM "queues" q
WHERE j."projectId" = q."projectId" AND q."name" = 'Default Queue';

-- Optional fallback for jobs without projects (if any somehow exist)
-- This won't happen here since projectId was NOT NULL and cascade was handled, but for safety:
DELETE FROM "jobs" WHERE "queueId" IS NULL;

-- Now make queueId NOT NULL
ALTER TABLE "jobs" ALTER COLUMN "queueId" SET NOT NULL;

-- Drop old foreign key and column
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_projectId_fkey";
DROP INDEX "jobs_projectId_idx";
ALTER TABLE "jobs" DROP COLUMN "projectId";

-- CreateIndex for jobs -> queueId
CREATE INDEX "jobs_queueId_idx" ON "jobs"("queueId");

-- AddForeignKey for jobs -> queues
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
