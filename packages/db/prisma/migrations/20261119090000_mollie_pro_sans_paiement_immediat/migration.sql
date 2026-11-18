-- Passage à Mollie, lot 6 (suite, docs/MOLLIE.md) : abonnement pris pendant une période en cours (essai, Pro offert,
-- ancien abonnement Stripe) sans paiement immédiat. Le moyen de paiement est enregistré par un paiement de vérification
-- de 0,02 €, remboursé aussitôt ; le premier prélèvement a lieu à la fin de la période en cours.
-- AlterEnum
ALTER TYPE "SubscriptionPaymentKind" ADD VALUE 'SETUP';

-- AlterTable
ALTER TABLE "SubscriptionPayment" ADD COLUMN     "refundedAt" TIMESTAMP(3);
