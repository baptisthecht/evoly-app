-- Limites d'achat : par acheteur et par tarif, en prévente, relevées par un code promo ; adresse normalisée des acheteurs
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "presaleMaxTicketsPerBuyer" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerEmailKey" TEXT;

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "raisesLimitTo" INTEGER;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "maxPerBuyer" INTEGER;

-- CreateIndex
CREATE INDEX "Order_eventId_buyerEmailKey_idx" ON "Order"("eventId", "buyerEmailKey");


-- Adresse normalisée des commandes existantes, même règle que l'application (@evoly/core, buyerEmailKey) :
-- minuscules ; Gmail : points et suffixe « + » ignorés, googlemail.com = gmail.com ; messageries à suffixe « + » : suffixe ignoré
WITH e AS (
  SELECT id, lower(trim("buyerEmail")) AS email FROM "Order" WHERE "buyerEmail" LIKE '%_@_%' AND "buyerEmailKey" IS NULL
), p AS (
  SELECT id, split_part(email, '@', 1) AS local, split_part(email, '@', 2) AS domain FROM e
)
UPDATE "Order" o SET "buyerEmailKey" = CASE
  WHEN p.domain IN ('gmail.com', 'googlemail.com') THEN replace(split_part(p.local, '+', 1), '.', '') || '@gmail.com'
  WHEN p.domain IN ('outlook.com', 'outlook.fr', 'outlook.be', 'hotmail.com', 'hotmail.fr', 'hotmail.be', 'live.com', 'live.fr', 'live.be', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'pm.me', 'fastmail.com', 'gmx.com', 'gmx.fr', 'gmx.de')
    THEN split_part(p.local, '+', 1) || '@' || p.domain
  ELSE p.local || '@' || p.domain
END
FROM p WHERE o.id = p.id;
