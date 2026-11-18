-- Passage à Mollie, lot 3 (docs/MOLLIE.md) : prestataire de chaque paiement en ligne et identifiant du paiement Mollie.
-- Les commandes déjà payées par Stripe sont marquées comme telles.

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MOLLIE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "molliePaymentId" TEXT,
ADD COLUMN     "paymentProvider" "PaymentProvider";

-- CreateIndex
CREATE UNIQUE INDEX "Order_molliePaymentId_key" ON "Order"("molliePaymentId");


-- Commandes payées par Stripe avant le passage à Mollie
UPDATE "Order" SET "paymentProvider" = 'STRIPE' WHERE "stripePaymentIntentId" IS NOT NULL;
