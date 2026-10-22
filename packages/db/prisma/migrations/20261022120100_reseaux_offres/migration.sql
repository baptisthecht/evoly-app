-- Compatibilité avec les réseaux de billetterie : réservée aux offres Pro et Partenaire
UPDATE "Plan" SET "features" = array(SELECT DISTINCT unnest("features" || ARRAY['DISTRIBUTION']::"PlanFeature"[])) WHERE "id" IN ('pro', 'partner');
