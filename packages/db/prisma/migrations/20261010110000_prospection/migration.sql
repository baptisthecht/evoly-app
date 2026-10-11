-- Prospection d'Evoly (back-office) : organisations démarchées et e-mails rédigés au cas par cas
CREATE TYPE "ProspectStatus" AS ENUM ('NOUVEAU', 'CONTACTE', 'REPONDU', 'CLIENT', 'PAS_INTERESSE', 'EXCLU');
CREATE TYPE "ProspectEmailStatus" AS ENUM ('A_ENVOYER', 'PROGRAMME', 'ENVOYE', 'ECHEC', 'RETIRE');
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NOUVEAU',
    "notes" TEXT,
    "source" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Prospect_email_key" ON "Prospect"("email");
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");
CREATE TABLE "ProspectEmail" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lot" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "why" TEXT,
    "source" TEXT,
    "status" "ProspectEmailStatus" NOT NULL DEFAULT 'A_ENVOYER',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProspectEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProspectEmail_externalId_key" ON "ProspectEmail"("externalId");
CREATE INDEX "ProspectEmail_status_scheduledAt_idx" ON "ProspectEmail"("status", "scheduledAt");
CREATE INDEX "ProspectEmail_lot_idx" ON "ProspectEmail"("lot");
ALTER TABLE "ProspectEmail" ADD CONSTRAINT "ProspectEmail_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
