-- Prospection : boîte d'envoi utilisée pour chaque e-mail (plusieurs boîtes possibles)
ALTER TABLE "ProspectEmail" ADD COLUMN "mailbox" TEXT;
