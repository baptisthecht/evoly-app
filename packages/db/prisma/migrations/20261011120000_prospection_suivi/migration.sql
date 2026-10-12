-- Prospection : statuts de suivi plus fins, date de relance, première réponse, historique, montée en charge réglable
ALTER TYPE "ProspectStatus" ADD VALUE IF NOT EXISTS 'INTERESSE';
ALTER TYPE "ProspectStatus" ADD VALUE IF NOT EXISTS 'RDV';
ALTER TYPE "ProspectStatus" ADD VALUE IF NOT EXISTS 'A_RELANCER';
ALTER TYPE "ProspectStatus" ADD VALUE IF NOT EXISTS 'INSCRIT';
ALTER TABLE "Prospect" ADD COLUMN "nextActionAt" TIMESTAMP(3);
ALTER TABLE "Prospect" ADD COLUMN "respondedAt" TIMESTAMP(3);
CREATE INDEX "Prospect_nextActionAt_idx" ON "Prospect"("nextActionAt");
ALTER TABLE "ProspectMailbox" ADD COLUMN "rampUp" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "ProspectActivity" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProspectActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProspectActivity_prospectId_createdAt_idx" ON "ProspectActivity"("prospectId", "createdAt");
ALTER TABLE "ProspectActivity" ADD CONSTRAINT "ProspectActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
