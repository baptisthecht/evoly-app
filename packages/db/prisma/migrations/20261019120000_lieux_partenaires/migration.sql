-- Lieux partenaires (section 9.32, décision n° 21)
CREATE TABLE "VenuePartner" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "shareBps" INTEGER NOT NULL DEFAULT 2000,
  "thresholdEnabled" BOOLEAN NOT NULL DEFAULT true,
  "thresholdMinor" INTEGER NOT NULL DEFAULT 2000,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VenuePartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VenuePartner_organizationId_key" ON "VenuePartner"("organizationId");
CREATE UNIQUE INDEX "VenuePartner_code_key" ON "VenuePartner"("code");
ALTER TABLE "VenuePartner" ADD CONSTRAINT "VenuePartner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "VenuePayout" (
  "id" TEXT NOT NULL,
  "venuePartnerId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "manual" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL,
  "stripeTransferId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenuePayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VenuePayout_venuePartnerId_createdAt_idx" ON "VenuePayout"("venuePartnerId", "createdAt");
ALTER TABLE "VenuePayout" ADD CONSTRAINT "VenuePayout_venuePartnerId_fkey" FOREIGN KEY ("venuePartnerId") REFERENCES "VenuePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD COLUMN "venuePartnerId" TEXT;
ALTER TABLE "Event" ADD CONSTRAINT "Event_venuePartnerId_fkey" FOREIGN KEY ("venuePartnerId") REFERENCES "VenuePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "venuePartnerId" TEXT;
ALTER TABLE "Order" ADD COLUMN "venueShareMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD CONSTRAINT "Order_venuePartnerId_fkey" FOREIGN KEY ("venuePartnerId") REFERENCES "VenuePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_venuePartnerId_idx" ON "Order"("venuePartnerId");
