-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_name_key" ON "projects"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Create a Default Project for every existing organization
INSERT INTO "projects" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, "id", 'Default Project', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations";

-- AlterTable jobs: add projectId as nullable first
ALTER TABLE "jobs" ADD COLUMN "projectId" TEXT;

-- Backfill existing jobs to the first available project (since jobs previously had no organization isolation)
UPDATE "jobs" SET "projectId" = (SELECT "id" FROM "projects" LIMIT 1) WHERE "projectId" IS NULL;

-- In case there were jobs but no organizations/projects, we might hit an issue. We assume empty DB or existing orgs.
-- Enforce NOT NULL on jobs.projectId
ALTER TABLE "jobs" ALTER COLUMN "projectId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "jobs_projectId_idx" ON "jobs"("projectId");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
