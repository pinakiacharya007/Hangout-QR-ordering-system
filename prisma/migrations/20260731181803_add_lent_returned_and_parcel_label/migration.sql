-- AlterTable
ALTER TABLE "TableSession" ADD COLUMN     "lentReturned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parcelLabel" TEXT;
