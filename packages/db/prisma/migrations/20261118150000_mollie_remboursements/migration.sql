-- Passage à Mollie, lot 4 (docs/MOLLIE.md) : remboursements Mollie des acheteurs et des vendeurs d'une revente.

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "mollieRefundId" TEXT;

-- AlterTable
ALTER TABLE "ResaleListing" ADD COLUMN     "sellerMollieRefundId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Refund_mollieRefundId_key" ON "Refund"("mollieRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "ResaleListing_sellerMollieRefundId_key" ON "ResaleListing"("sellerMollieRefundId");

