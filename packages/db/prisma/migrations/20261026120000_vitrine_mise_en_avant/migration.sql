-- Vitrine de l'organisateur : événement mis en avant (aucun, le prochain par défaut, ou un événement choisi)
-- CreateEnum
CREATE TYPE "FeaturedMode" AS ENUM ('NONE', 'NEXT', 'CHOSEN');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "featuredEventId" TEXT,
ADD COLUMN     "featuredMode" "FeaturedMode" NOT NULL DEFAULT 'NEXT';

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_featuredEventId_fkey" FOREIGN KEY ("featuredEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

