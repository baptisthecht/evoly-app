-- Source de la première visite du créateur de l'organisation (traçage, docs/TRACKING.md)
ALTER TABLE "Organization" ADD COLUMN "acquisition" JSONB;
