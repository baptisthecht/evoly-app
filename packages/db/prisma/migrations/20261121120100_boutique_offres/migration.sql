-- Boutique : fonctionnalité des offres Pro et Partenaire ; droit « Gérer la boutique » donné aux rôles système
-- Propriétaire, Administrateur et Gestion des événements (les rôles personnalisés le reçoivent de leur propriétaire).
-- Migration séparée : une valeur ajoutée à un type énuméré n'est utilisable qu'après la migration qui l'ajoute.
UPDATE "Plan" SET "features" = array(SELECT DISTINCT unnest("features" || ARRAY['SHOP']::"PlanFeature"[])) WHERE "id" IN ('pro', 'partner');
UPDATE "Role" SET "permissions" = array(SELECT DISTINCT unnest("permissions" || ARRAY['SHOP_MANAGE']::"Permission"[])) WHERE "systemKey" IN ('OWNER', 'ADMIN', 'MANAGER');
