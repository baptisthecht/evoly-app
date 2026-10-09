-- Prévente privée : incluse dans les offres Pro et Partenaire (migration séparée : une valeur d'énumération ne peut pas servir dans la transaction qui la crée)
UPDATE "Plan" SET "features" = array_append("features", 'PRESALE_CODES'::"PlanFeature") WHERE "id" IN ('pro', 'partner') AND NOT ('PRESALE_CODES'::"PlanFeature" = ANY("features"));
