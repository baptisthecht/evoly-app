-- CreateEnum
CREATE TYPE "SeatingBlockKind" AS ENUM ('ROWS', 'TABLE_ROUND', 'TABLE_RECT', 'STANDING', 'SHAPE');

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "accessible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "angle" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "x" DOUBLE PRECISION,
ADD COLUMN     "y" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SeatingMap" ADD COLUMN     "focusX" DOUBLE PRECISION,
ADD COLUMN     "focusY" DOUBLE PRECISION,
ADD COLUMN     "template" TEXT;

-- AlterTable
ALTER TABLE "SeatingRow" ADD COLUMN     "blockId" TEXT;

-- CreateTable
CREATE TABLE "SeatingBlock" (
    "id" TEXT NOT NULL,
    "seatingMapId" TEXT NOT NULL,
    "kind" "SeatingBlockKind" NOT NULL,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "params" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatingBlock_seatingMapId_idx" ON "SeatingBlock"("seatingMapId");

-- CreateIndex
CREATE INDEX "SeatingRow_blockId_idx" ON "SeatingRow"("blockId");

-- AddForeignKey
ALTER TABLE "SeatingRow" ADD CONSTRAINT "SeatingRow_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "SeatingBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingBlock" ADD CONSTRAINT "SeatingBlock_seatingMapId_fkey" FOREIGN KEY ("seatingMapId") REFERENCES "SeatingMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
