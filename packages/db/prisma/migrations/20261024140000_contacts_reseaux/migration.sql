-- Contacts marketing venus d'un réseau de billetterie : source « NETWORK » et provenance du consentement (vague d'import, mention lisible)
-- AlterEnum
ALTER TYPE "ConsentSource" ADD VALUE IF NOT EXISTS 'NETWORK';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "consentBatchId" TEXT,
ADD COLUMN     "consentNote" TEXT;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_consentBatchId_fkey" FOREIGN KEY ("consentBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

