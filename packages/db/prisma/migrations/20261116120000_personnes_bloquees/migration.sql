-- Personnes bloquées par une organisation (jamais partagées) : par adresse normalisée et par empreinte de carte,
-- refusées avant le débit ; le nom et le prénom signalent seulement la commande (pastille « Signalé »).
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BUYER_FLAGGED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "flaggedBlockedBuyerId" TEXT;

-- CreateTable
CREATE TABLE "BlockedBuyer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT,
    "emailKey" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "nameKey" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedBuyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedCard" (
    "id" TEXT NOT NULL,
    "blockedBuyerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedBuyer_organizationId_emailKey_idx" ON "BlockedBuyer"("organizationId", "emailKey");

-- CreateIndex
CREATE INDEX "BlockedBuyer_organizationId_nameKey_idx" ON "BlockedBuyer"("organizationId", "nameKey");

-- CreateIndex
CREATE INDEX "BlockedBuyer_organizationId_createdAt_idx" ON "BlockedBuyer"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BlockedCard_organizationId_fingerprint_idx" ON "BlockedCard"("organizationId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedCard_blockedBuyerId_fingerprint_key" ON "BlockedCard"("blockedBuyerId", "fingerprint");

-- CreateIndex
CREATE INDEX "Order_flaggedBlockedBuyerId_idx" ON "Order"("flaggedBlockedBuyerId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_flaggedBlockedBuyerId_fkey" FOREIGN KEY ("flaggedBlockedBuyerId") REFERENCES "BlockedBuyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedBuyer" ADD CONSTRAINT "BlockedBuyer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedBuyer" ADD CONSTRAINT "BlockedBuyer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedCard" ADD CONSTRAINT "BlockedCard_blockedBuyerId_fkey" FOREIGN KEY ("blockedBuyerId") REFERENCES "BlockedBuyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

