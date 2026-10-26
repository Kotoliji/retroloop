-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "groupId" UUID;

-- AlterTable
ALTER TABLE "Retro" ADD COLUMN     "facilitatorId" TEXT,
ADD COLUMN     "focusCardId" TEXT,
ADD COLUMN     "hostKeyHash" TEXT,
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'write',
ADD COLUMN     "timerEndsAt" TIMESTAMP(3),
ADD COLUMN     "votesPerPerson" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "retroId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "cardId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_retroId_idx" ON "Vote"("retroId");

-- CreateIndex
CREATE INDEX "Vote_participantId_idx" ON "Vote"("participantId");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_retroId_fkey" FOREIGN KEY ("retroId") REFERENCES "Retro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
