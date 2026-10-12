-- Billetterie intégrable (section 9.26, Pro) : sites autorisés à afficher le module
ALTER TABLE "Organization" ADD COLUMN "embedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];
