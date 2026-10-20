-- Style propre à un événement (Pro) : fond, arrondi, polices, texte du bouton
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "backgroundColor" TEXT,
ADD COLUMN     "bodyFont" TEXT,
ADD COLUMN     "buttonLabel" TEXT,
ADD COLUMN     "headingFont" TEXT,
ADD COLUMN     "radius" TEXT;

