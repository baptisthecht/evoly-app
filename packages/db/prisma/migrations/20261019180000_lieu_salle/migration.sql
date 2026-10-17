-- Salle du lieu partenaire : seuls les événements qui y ont lieu sont comptés (décision du 19 octobre 2026)
ALTER TABLE "VenuePartner" ADD COLUMN "hallName" TEXT;
ALTER TABLE "VenuePartner" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "VenuePartner" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "VenuePartner" ADD COLUMN "city" TEXT;
ALTER TABLE "VenuePartner" ADD COLUMN "country" TEXT;
