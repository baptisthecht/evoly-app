-- Vente sur place (section 9.27) : autorisation par lien de scanner, mode de paiement et vendeur de chaque vente
CREATE TYPE "BoxOfficeMode" AS ENUM ('CASH', 'QR');
ALTER TABLE "ScannerLink" ADD COLUMN "canSell" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "boxOfficeMode" "BoxOfficeMode";
ALTER TABLE "Order" ADD COLUMN "soldByLinkId" TEXT;
CREATE INDEX "Order_soldByLinkId_idx" ON "Order"("soldByLinkId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_soldByLinkId_fkey" FOREIGN KEY ("soldByLinkId") REFERENCES "ScannerLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
