-- Prospection : boîtes d'envoi configurées dans le back-office (mot de passe chiffré), reliées à chaque e-mail
CREATE TABLE "ProspectMailbox" (
    "id" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "maxPerDay" INTEGER NOT NULL DEFAULT 40,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProspectMailbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProspectMailbox_address_key" ON "ProspectMailbox"("address");
ALTER TABLE "ProspectEmail" ADD COLUMN "mailboxId" TEXT;
CREATE INDEX "ProspectEmail_mailboxId_status_idx" ON "ProspectEmail"("mailboxId", "status");
ALTER TABLE "ProspectEmail" ADD CONSTRAINT "ProspectEmail_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "ProspectMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
