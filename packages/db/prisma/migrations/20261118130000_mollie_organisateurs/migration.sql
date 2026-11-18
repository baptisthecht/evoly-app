-- Passage à Mollie, lot 2 (docs/MOLLIE.md) : page Mollie où l'organisateur complète son inscription, dernière relecture
-- de l'état du compte, et notification « action requise chez Mollie ».

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MOLLIE_ACTION_REQUIRED';

-- AlterTable
ALTER TABLE "MollieAccount" ADD COLUMN     "onboardingUrl" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

