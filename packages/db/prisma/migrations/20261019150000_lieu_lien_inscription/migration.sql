-- Organisateur rattaché à un lieu partenaire par son lien d'inscription (RG-LIEU-02)
ALTER TABLE "Organization" ADD COLUMN "referredByVenueId" TEXT;
ALTER TABLE "Organization" ADD COLUMN "referredByVenueAt" TIMESTAMP(3);
CREATE INDEX "Organization_referredByVenueId_idx" ON "Organization"("referredByVenueId");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_referredByVenueId_fkey" FOREIGN KEY ("referredByVenueId") REFERENCES "VenuePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
