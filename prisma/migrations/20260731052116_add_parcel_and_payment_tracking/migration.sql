-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "isParcel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TableSession" ADD COLUMN     "lentToName" TEXT,
ADD COLUMN     "paymentMethod" TEXT;
