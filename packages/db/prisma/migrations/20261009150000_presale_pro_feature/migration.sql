-- Prévente privée réservée à Pro : nouvelle fonction d'offre
ALTER TYPE "PlanFeature" ADD VALUE IF NOT EXISTS 'PRESALE_CODES';
