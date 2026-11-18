-- Passage à Mollie, lot 1 (docs/MOLLIE.md) : compte Mollie de l'organisateur, relié par OAuth (Mollie Connect pour
-- plateformes). Jetons chiffrés ; état de l'inscription chez Mollie relu tant qu'elle n'est pas terminée.

-- CreateEnum
CREATE TYPE "MollieOnboardingStatus" AS ENUM ('NEEDS_DATA', 'IN_REVIEW', 'COMPLETED');

-- CreateTable
CREATE TABLE "MollieAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mollieOrganizationId" TEXT NOT NULL,
    "testmode" BOOLEAN NOT NULL DEFAULT false,
    "profileId" TEXT,
    "profileStatus" TEXT,
    "methods" TEXT[],
    "onboardingStatus" "MollieOnboardingStatus" NOT NULL DEFAULT 'NEEDS_DATA',
    "canReceivePayments" BOOLEAN NOT NULL DEFAULT false,
    "canReceiveSettlements" BOOLEAN NOT NULL DEFAULT false,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MollieAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MollieAccount_organizationId_key" ON "MollieAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MollieAccount_mollieOrganizationId_key" ON "MollieAccount"("mollieOrganizationId");

-- CreateIndex
CREATE INDEX "MollieAccount_onboardingStatus_idx" ON "MollieAccount"("onboardingStatus");

-- AddForeignKey
ALTER TABLE "MollieAccount" ADD CONSTRAINT "MollieAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

