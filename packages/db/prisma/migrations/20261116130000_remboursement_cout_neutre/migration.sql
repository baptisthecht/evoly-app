-- Remboursement à coût neutre : remboursement demandé par l'acheteur intégral, ou moins les frais de paiement et la commission.
-- Réglage par événement (repris de l'organisation à la création), figé sur la commande à la réservation ; frais retenus notés sur le remboursement.
-- CreateEnum
CREATE TYPE "RefundFeeMode" AS ENUM ('FULL', 'MINUS_FEES');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "refundFeeMode" "RefundFeeMode" NOT NULL DEFAULT 'FULL';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundFeeMode" "RefundFeeMode" NOT NULL DEFAULT 'FULL';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "refundFeeMode" "RefundFeeMode" NOT NULL DEFAULT 'FULL';

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "feesWithheldMinor" INTEGER NOT NULL DEFAULT 0;

