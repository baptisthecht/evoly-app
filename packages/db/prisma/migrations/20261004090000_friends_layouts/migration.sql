-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "friendCode" TEXT;

-- CreateTable
CREATE TABLE "SeatingLayout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "plan" JSONB NOT NULL,
    "seatCount" INTEGER NOT NULL DEFAULT 0,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_friendCode_key" ON "Order"("friendCode");

-- CreateIndex
CREATE INDEX "SeatingLayout_organizationId_idx" ON "SeatingLayout"("organizationId");

-- CreateIndex
CREATE INDEX "SeatingLayout_shared_idx" ON "SeatingLayout"("shared");

-- AddForeignKey
ALTER TABLE "SeatingLayout" ADD CONSTRAINT "SeatingLayout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
