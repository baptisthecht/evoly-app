-- Lieux partenaires : autofacturation de leur part (RG-LIEU-07)
ALTER TABLE "VenuePartner" ADD COLUMN "selfBillingAcceptedAt" TIMESTAMP(3);
ALTER TABLE "VenuePartner" ADD COLUMN "invoiceSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VenuePayout" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "VenuePayout" ADD COLUMN "netMinor" INTEGER;
ALTER TABLE "VenuePayout" ADD COLUMN "vatMinor" INTEGER;
ALTER TABLE "VenuePayout" ADD COLUMN "vatRateBps" INTEGER;
ALTER TABLE "VenuePayout" ADD COLUMN "vatMention" TEXT;
CREATE UNIQUE INDEX "VenuePayout_invoiceNumber_key" ON "VenuePayout"("invoiceNumber");
