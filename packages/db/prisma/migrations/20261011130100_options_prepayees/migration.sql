-- Les nouvelles fonctions rejoignent les offres Pro et Partenaire
UPDATE "Plan" SET "features" = array(SELECT DISTINCT unnest("features" || ARRAY['PREPAID_OPTIONS', 'EMBED_WIDGET', 'AMBASSADORS']::"PlanFeature"[])) WHERE "id" IN ('pro', 'partner');

-- Options et consommations prépayées (section 9.29)
CREATE TABLE "EventOption" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "stock" INTEGER,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventOption_price_nonneg" CHECK ("priceMinor" >= 0),
    CONSTRAINT "EventOption_stock_nonneg" CHECK ("stock" IS NULL OR "stock" >= 0),
    CONSTRAINT "EventOption_max_pos" CHECK ("maxPerOrder" >= 1)
);
CREATE INDEX "EventOption_eventId_idx" ON "EventOption"("eventId");
ALTER TABLE "EventOption" ADD CONSTRAINT "EventOption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderOption" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "unitFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "redeemed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderOption_pkey" PRIMARY KEY ("id"),
    -- jamais plus retiré au bar que ce qui a été acheté (RG-OPT-04), garanti par la base
    CONSTRAINT "OrderOption_quantity_pos" CHECK ("quantity" >= 1),
    CONSTRAINT "OrderOption_redeemed_range" CHECK ("redeemed" >= 0 AND "redeemed" <= "quantity")
);
CREATE INDEX "OrderOption_orderId_idx" ON "OrderOption"("orderId");
CREATE INDEX "OrderOption_optionId_idx" ON "OrderOption"("optionId");
ALTER TABLE "OrderOption" ADD CONSTRAINT "OrderOption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderOption" ADD CONSTRAINT "OrderOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "EventOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OptionRedemption" (
    "id" TEXT NOT NULL,
    "orderOptionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "deviceId" TEXT,
    "staffName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptionRedemption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OptionRedemption_quantity_pos" CHECK ("quantity" >= 1)
);
CREATE INDEX "OptionRedemption_orderOptionId_idx" ON "OptionRedemption"("orderOptionId");
ALTER TABLE "OptionRedemption" ADD CONSTRAINT "OptionRedemption_orderOptionId_fkey" FOREIGN KEY ("orderOptionId") REFERENCES "OrderOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
