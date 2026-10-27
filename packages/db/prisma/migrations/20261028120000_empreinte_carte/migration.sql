-- Limites d'achat : empreinte de la carte (Stripe) de chaque commande, lue avant le paiement ; jamais un numéro de carte
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cardFingerprint" TEXT;

-- CreateIndex
CREATE INDEX "Order_eventId_cardFingerprint_idx" ON "Order"("eventId", "cardFingerprint");

