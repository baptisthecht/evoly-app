-- Passage de Stripe du mode test au mode réel : à lancer UNE fois, juste après avoir mis les clés réelles en production.
-- Les identifiants créés en mode test (comptes connectés acct_, clients cus_, abonnements sub_) n'existent pas en mode
-- réel. Les liens sont retirés : les organisateurs reconnectent leur compte Stripe, les abonnements Pro de test sont
-- clos (retour à l'offre gratuite). Rien d'autre n'est touché ; tout ou rien, en une transaction.
--
--   docker compose exec -T db psql -U evoly -d evoly -v ON_ERROR_STOP=1 < ops/stripe-live-reset.sql
BEGIN;

-- état avant, pour mémoire
SELECT count(*) AS comptes_stripe_de_test FROM "StripeAccount";
SELECT count(*) AS abonnements_lies_a_stripe FROM "Subscription" WHERE "stripeCustomerId" IS NOT NULL OR "stripeSubscriptionId" IS NOT NULL;

-- comptes connectés de test : retirés (aucune autre table n'en dépend)
DELETE FROM "StripeAccount";

-- abonnements Pro payés en mode test : clos ; clients et abonnements de test détachés
UPDATE "Subscription" SET status = 'CANCELED' WHERE "stripeSubscriptionId" IS NOT NULL;
UPDATE "Subscription" SET "stripeCustomerId" = NULL, "stripeSubscriptionId" = NULL WHERE "stripeCustomerId" IS NOT NULL OR "stripeSubscriptionId" IS NOT NULL;

COMMIT;
