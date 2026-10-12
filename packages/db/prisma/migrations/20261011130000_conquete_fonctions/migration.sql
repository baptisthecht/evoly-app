-- Lot Conquête : nouvelles fonctions de l'offre Pro (options et consommations, billetterie intégrable, ambassadeurs).
-- Seules dans leur migration : PostgreSQL n'utilise une nouvelle valeur d'énumération qu'après la fin de la transaction qui l'ajoute.
ALTER TYPE "PlanFeature" ADD VALUE IF NOT EXISTS 'PREPAID_OPTIONS';
ALTER TYPE "PlanFeature" ADD VALUE IF NOT EXISTS 'EMBED_WIDGET';
ALTER TYPE "PlanFeature" ADD VALUE IF NOT EXISTS 'AMBASSADORS';
