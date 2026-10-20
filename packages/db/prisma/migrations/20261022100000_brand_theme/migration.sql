-- Personnalisation de la billetterie : fond, arrondi, polices, texte du bouton, réseaux sociaux
-- AlterTable
ALTER TABLE "OrganizationBrand" ADD COLUMN     "backgroundColor" TEXT,
ADD COLUMN     "bodyFont" TEXT,
ADD COLUMN     "buttonLabel" TEXT,
ADD COLUMN     "headingFont" TEXT,
ADD COLUMN     "radius" TEXT,
ADD COLUMN     "socialLinks" JSONB;

