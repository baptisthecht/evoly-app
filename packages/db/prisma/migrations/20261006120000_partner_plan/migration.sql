-- Offre Partenaire : Pro offert par Evoly, sans commission, attribuée par les administrateurs (non publique).
-- Mêmes fonctionnalités que Pro ; aucune commission dans chaque devise de Pro. Sur une base neuve, le script d'initialisation la crée.
INSERT INTO "Plan" ("id", "name", "feeRateBps", "trialDays", "features", "isPublic", "sortOrder", "createdAt", "updatedAt")
SELECT 'partner', 'Partenaire', 0, 0, "features", false, 2, now(), now() FROM "Plan" WHERE "id" = 'pro'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "PlanCurrencyTerms" ("id", "planId", "currency", "feeFixedMinor", "feeCapMinor", "monthlyPriceMinor", "yearlyPriceMinor", "pricesIncludeTax")
SELECT 'partner_' || lower("currency"), 'partner', "currency", 0, 0, 0, 0, "pricesIncludeTax" FROM "PlanCurrencyTerms" WHERE "planId" = 'pro'
ON CONFLICT ("planId", "currency") DO NOTHING;
