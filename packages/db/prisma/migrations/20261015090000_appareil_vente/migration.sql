-- Rapport de caisse par appareil (RG-POS-07) : appareil de la vente sur place
ALTER TABLE "Order" ADD COLUMN "soldByDeviceId" TEXT;
