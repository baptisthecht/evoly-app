-- Prospection : serveur de réception des boîtes et copie des envois dans « Envoyés »
ALTER TABLE "ProspectMailbox" ADD COLUMN "imapHost" TEXT;
ALTER TABLE "ProspectMailbox" ADD COLUMN "imapPort" INTEGER NOT NULL DEFAULT 993;
ALTER TABLE "ProspectEmail" ADD COLUMN "copiedAt" TIMESTAMP(3);
