-- Boutique (lot 3d) : livraison simple à prix fixe ; mode, adresse, TVA de la livraison, transporteur, numéro et lien
-- de suivi sur la commande ; la livraison ne se rembourse qu'une fois. Index des lieux de retrait et des modes de
-- livraison des commandes (suppression d'un lieu ou d'un mode sans parcourir toutes les commandes).

-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "shipAddress1" TEXT,
ADD COLUMN     "shipAddress2" TEXT,
ADD COLUMN     "shipCity" TEXT,
ADD COLUMN     "shipCountry" CHAR(2),
ADD COLUMN     "shipName" TEXT,
ADD COLUMN     "shipPostalCode" TEXT,
ADD COLUMN     "shippingMethodId" TEXT,
ADD COLUMN     "shippingName" TEXT,
ADD COLUMN     "shippingRefunded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippingVatBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "trackingUrl" TEXT;

-- CreateIndex
CREATE INDEX "ShopOrder_pickupPointId_idx" ON "ShopOrder"("pickupPointId");

-- CreateIndex
CREATE INDEX "ShopOrder_shippingMethodId_idx" ON "ShopOrder"("shippingMethodId");

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TVA de la livraison dans les bornes des taux des produits
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_shipping_vat_range" CHECK ("shippingVatBps" >= 0 AND "shippingVatBps" <= 3000);
