-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Insert Default Organization
INSERT INTO "organizations" ("id", "name", "slug", "createdAt", "updatedAt") 
VALUES ('default-org-id', 'Default Organization', 'default-org', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "organizationId" TEXT;

-- Backfill existing users
UPDATE "users" SET "organizationId" = 'default-org-id' WHERE "organizationId" IS NULL;

-- AlterTable: make column NOT NULL
ALTER TABLE "users" ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
