-- Remboursement des options (RG-OPT-07)
ALTER TABLE "OrderOption" ADD COLUMN "refunded" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN "optionsRefundAfterStart" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "RefundOptionItem" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "orderOptionId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundOptionItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RefundOptionItem_refundId_idx" ON "RefundOptionItem"("refundId");
CREATE INDEX "RefundOptionItem_orderOptionId_idx" ON "RefundOptionItem"("orderOptionId");
ALTER TABLE "RefundOptionItem" ADD CONSTRAINT "RefundOptionItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundOptionItem" ADD CONSTRAINT "RefundOptionItem_orderOptionId_fkey" FOREIGN KEY ("orderOptionId") REFERENCES "OrderOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
