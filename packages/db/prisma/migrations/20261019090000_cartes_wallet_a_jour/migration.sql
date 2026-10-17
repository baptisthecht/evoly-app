-- Passes Wallet tenus à jour (RG-POST-04)
ALTER TABLE "Ticket" ADD COLUMN "walletGoogle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN "walletHash" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "walletUpdatedAt" TIMESTAMP(3);
CREATE TABLE "WalletRegistration" (
  "id" TEXT NOT NULL,
  "deviceLibraryIdentifier" TEXT NOT NULL,
  "pushToken" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WalletRegistration_deviceLibraryIdentifier_ticketId_key" ON "WalletRegistration"("deviceLibraryIdentifier", "ticketId");
CREATE INDEX "WalletRegistration_ticketId_idx" ON "WalletRegistration"("ticketId");
ALTER TABLE "WalletRegistration" ADD CONSTRAINT "WalletRegistration_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
