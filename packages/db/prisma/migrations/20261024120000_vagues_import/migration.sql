-- Vagues d'import des billets des réseaux (docs/COMPATIBILITE_RESEAUX.md) : chaque import enregistré, confirmé et supprimable ; e-mail, téléphone et consentement des acheteurs
-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('IMPORTED', 'DELETED');

-- AlterTable
ALTER TABLE "ExternalTicket" ADD COLUMN     "holderEmail" TEXT,
ADD COLUMN     "holderPhone" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "marketingConsent" BOOLEAN;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "header" BOOLEAN NOT NULL DEFAULT true,
    "fullFile" BOOLEAN NOT NULL DEFAULT false,
    "report" JSONB,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'IMPORTED',
    "createdById" TEXT,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedCount" INTEGER,
    "keptEntered" INTEGER,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "consentSource" TEXT,
    "attestedAt" TIMESTAMP(3),
    "attestationText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_eventId_distributorId_createdAt_idx" ON "ImportBatch"("eventId", "distributorId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalTicket_importBatchId_idx" ON "ExternalTicket"("importBatchId");

-- AddForeignKey
ALTER TABLE "ExternalTicket" ADD CONSTRAINT "ExternalTicket_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Billets déjà importés avant le suivi des vagues : une vague « Import initial » par événement et par réseau, pour pouvoir
-- les supprimer comme les autres (les codes créés à l'avance par Evoly ne sont pas des imports)
INSERT INTO "ImportBatch" ("id", "eventId", "distributorId", "fileName", "mapping", "header", "fullFile", "status", "createdAt")
SELECT 'imp_' || md5(t."eventId" || ':' || t."distributorId"), t."eventId", t."distributorId", 'Import initial', '{}'::jsonb, true, false, 'IMPORTED', min(t."createdAt")
FROM "ExternalTicket" t
WHERE t."precreated" = false AND t."importBatchId" IS NULL
GROUP BY t."eventId", t."distributorId";

UPDATE "ExternalTicket" t
SET "importBatchId" = 'imp_' || md5(t."eventId" || ':' || t."distributorId")
WHERE t."precreated" = false AND t."importBatchId" IS NULL;
