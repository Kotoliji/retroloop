-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN     "reminderEmail" TEXT,
ADD COLUMN     "reminderLocale" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
