-- Contraintes complémentaires (CDC section 8.5), que Prisma ne sait pas exprimer.
-- À ajouter à la fin du fichier SQL de la première migration générée par `prisma migrate dev --create-only`,
-- puis à appliquer avec `prisma migrate dev`.

-- Une seule annonce de revente ouverte par billet (RG-RSL-03)
CREATE UNIQUE INDEX "ResaleListing_one_open_per_ticket"
  ON "ResaleListing" ("ticketId")
  WHERE "status" IN ('ACTIVE', 'RESERVED');

-- Prix de revente plafonné à la valeur faciale (RG-RSL-02, RG-LEG-03)
ALTER TABLE "ResaleListing"
  ADD CONSTRAINT "ResaleListing_price_le_face_value" CHECK ("priceMinor" >= 0 AND "priceMinor" <= "faceValueMinor");

-- Stocks jamais négatifs (RG-BUY-01)
ALTER TABLE "TicketType"
  ADD CONSTRAINT "TicketType_stock_non_negative" CHECK ("quantitySold" >= 0 AND "quantityHeld" >= 0),
  ADD CONSTRAINT "TicketType_stock_within_quantity" CHECK ("quantity" IS NULL OR "quantitySold" + "quantityHeld" <= "quantity"),
  ADD CONSTRAINT "TicketType_price_non_negative" CHECK ("priceMinor" >= 0);

ALTER TABLE "PriceTier"
  ADD CONSTRAINT "PriceTier_stock_non_negative" CHECK ("quantitySold" >= 0 AND "quantityHeld" >= 0),
  ADD CONSTRAINT "PriceTier_stock_within_limit" CHECK ("quantityLimit" IS NULL OR "quantitySold" + "quantityHeld" <= "quantityLimit"),
  ADD CONSTRAINT "PriceTier_price_non_negative" CHECK ("priceMinor" >= 0);

-- Montants de commande cohérents
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_consistent" CHECK (
    "subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "totalMinor" = "subtotalMinor" - "discountMinor"
    AND "applicationFeeMinor" >= 0 AND "refundedMinor" >= 0 AND "refundedMinor" <= "totalMinor"
  );

-- Numérotation des relevés de commissions sans trou (RG-FEE-30)
CREATE SEQUENCE IF NOT EXISTS "commission_statement_number_seq" START 1;
