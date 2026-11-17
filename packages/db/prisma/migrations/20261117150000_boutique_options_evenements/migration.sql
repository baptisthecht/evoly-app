-- Boutique (lot 3c) : une option d'événement peut reprendre un produit de la boutique (nom, prix, stock partagé) ;
-- l'option achetée garde la variante choisie et son libellé. Un produit proposé en option ne se supprime pas.

-- AlterTable
ALTER TABLE "EventOption" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "OrderOption" ADD COLUMN     "productVariantId" TEXT,
ADD COLUMN     "variantLabel" TEXT;

-- CreateIndex
CREATE INDEX "EventOption_productId_idx" ON "EventOption"("productId");

-- CreateIndex
CREATE INDEX "OrderOption_productVariantId_idx" ON "OrderOption"("productVariantId");

-- AddForeignKey
ALTER TABLE "EventOption" ADD CONSTRAINT "EventOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderOption" ADD CONSTRAINT "OrderOption_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

