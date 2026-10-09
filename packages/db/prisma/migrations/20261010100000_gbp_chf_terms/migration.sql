-- Livre sterling et franc suisse (P1). Livre : équivalent de l'euro au cours de l'été 2026 (1 € ≈ 0,855 £) ;
-- franc suisse : mêmes montants qu'en euros (environ 7 % de plus, accepté).
INSERT INTO "PlanCurrencyTerms" ("id", "planId", "currency", "feeFixedMinor", "feeCapMinor", "monthlyPriceMinor", "yearlyPriceMinor") VALUES
  ('terms-free-gbp', 'free', 'GBP', 25, 215, 0, 0),
  ('terms-pro-gbp', 'pro', 'GBP', 25, 85, 2500, 25500),
  ('terms-partner-gbp', 'partner', 'GBP', 0, 0, 0, 0),
  ('terms-free-chf', 'free', 'CHF', 29, 250, 0, 0),
  ('terms-pro-chf', 'pro', 'CHF', 29, 100, 2900, 29580),
  ('terms-partner-chf', 'partner', 'CHF', 0, 0, 0, 0)
ON CONFLICT ("planId", "currency") DO UPDATE SET
  "feeFixedMinor" = EXCLUDED."feeFixedMinor", "feeCapMinor" = EXCLUDED."feeCapMinor",
  "monthlyPriceMinor" = EXCLUDED."monthlyPriceMinor", "yearlyPriceMinor" = EXCLUDED."yearlyPriceMinor";
