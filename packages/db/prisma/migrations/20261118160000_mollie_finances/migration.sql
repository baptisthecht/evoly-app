-- Passage à Mollie, lot 5 (docs/MOLLIE.md) : rétrofacturations Mollie copiées comme litiges, et dernier versement
-- échoué signalé à l'organisateur.

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "mollieChargebackId" TEXT,
ALTER COLUMN "stripeDisputeId" DROP NOT NULL,
ALTER COLUMN "stripeChargeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MollieAccount" ADD COLUMN     "failedSettlementNotifiedId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_mollieChargebackId_key" ON "Dispute"("mollieChargebackId");

