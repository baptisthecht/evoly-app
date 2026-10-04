-- Grille d'octobre 2026 : 0,29 € + 2 % par billet payant, plafonnée à 2,50 € (Free) et 1 € (Pro).
-- Les commandes passées gardent leurs conditions (Order.feeSnapshot) : seules les nouvelles ventes sont concernées.
UPDATE "Plan" SET "feeRateBps" = 200 WHERE "id" IN ('free', 'pro');
UPDATE "PlanCurrencyTerms" SET "feeFixedMinor" = 29, "feeCapMinor" = 250 WHERE "planId" = 'free' AND "currency" = 'EUR';
UPDATE "PlanCurrencyTerms" SET "feeFixedMinor" = 29, "feeCapMinor" = 100 WHERE "planId" = 'pro' AND "currency" = 'EUR';
