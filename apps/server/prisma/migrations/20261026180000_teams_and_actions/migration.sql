-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- AlterTable: teamId starts nullable so existing retros can be backfilled
ALTER TABLE "Retro" ADD COLUMN     "hasReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextRetroId" TEXT,
ADD COLUMN     "number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "teamId" TEXT;

-- Backfill: every existing retro becomes the first retro of its own team,
-- named after the retro. The retro id is reused as the team id.
INSERT INTO "Team" ("id", "name", "createdAt")
SELECT "id", "title", "createdAt" FROM "Retro";

UPDATE "Retro" SET "teamId" = "id", "title" = 'Retro 1';

ALTER TABLE "Retro" ALTER COLUMN "teamId" SET NOT NULL;

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" UUID NOT NULL,
    "teamId" TEXT NOT NULL,
    "retroId" TEXT NOT NULL,
    "sourceCardId" UUID,
    "text" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewedInRetroId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionItem_teamId_status_idx" ON "ActionItem"("teamId", "status");

-- CreateIndex
CREATE INDEX "ActionItem_retroId_idx" ON "ActionItem"("retroId");

-- CreateIndex
CREATE UNIQUE INDEX "Retro_teamId_number_key" ON "Retro"("teamId", "number");

-- AddForeignKey
ALTER TABLE "Retro" ADD CONSTRAINT "Retro_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_retroId_fkey" FOREIGN KEY ("retroId") REFERENCES "Retro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
