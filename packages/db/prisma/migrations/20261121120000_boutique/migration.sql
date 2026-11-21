-- Boutique (lot 3, Pro), section 9.35 du CDC, regroupée après le passage à Mollie : produits de l'organisation (images,
-- options libres, variantes avec stock et supplément de prix, taux de TVA propre), lieux de retrait et modes de
-- livraison ; commandes de la boutique, séparées des commandes de billets, payées sur le compte Mollie de l'organisation
-- sans commission Evoly (paiement Mollie de la commande, remboursements Mollie) ; lignes figées à l'achat ; option
-- d'événement reprenant un produit (lot 3c) ; livraison à prix fixe (lot 3d). Fonctionnalité SHOP, droit SHOP_MANAGE et
-- notifications de la boutique. Stocks jamais négatifs ni dépassés, montants cohérents : garantis par la base.

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ON_SALE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('PICKUP', 'SHIPPING');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('TO_PREPARE', 'READY', 'PICKED_UP', 'SHIPPED');

-- CreateEnum
CREATE TYPE "ShopRefundReason" AS ENUM ('WITHDRAWAL', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "ShopRefundStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SHOP_ORDER_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'SHOP_WITHDRAWAL';

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'SHOP_MANAGE';

-- AlterEnum
ALTER TYPE "PlanFeature" ADD VALUE 'SHOP';

-- AlterTable
ALTER TABLE "EventOption" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "OrderOption" ADD COLUMN     "productVariantId" TEXT,
ADD COLUMN     "variantLabel" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shippingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceDeltaMinor" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "held" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingMethod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'PICKUP',
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'TO_PREPARE',
    "pickupPointId" TEXT,
    "pickupName" TEXT,
    "pickupAddress" TEXT,
    "pickupInstructions" TEXT,
    "shippingMethodId" TEXT,
    "shippingName" TEXT,
    "shippingVatBps" INTEGER NOT NULL DEFAULT 0,
    "shippingRefunded" BOOLEAN NOT NULL DEFAULT false,
    "shipName" TEXT,
    "shipAddress1" TEXT,
    "shipAddress2" TEXT,
    "shipPostalCode" TEXT,
    "shipCity" TEXT,
    "shipCountry" CHAR(2),
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "buyerFirstName" TEXT,
    "buyerLastName" TEXT,
    "buyerEmail" TEXT,
    "buyerEmailKey" TEXT,
    "buyerPhone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "currency" CHAR(3) NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "vatMinor" INTEGER NOT NULL DEFAULT 0,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "molliePaymentId" TEXT,
    "paymentMethodType" TEXT,
    "cardFingerprint" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "accessTokenHash" TEXT,
    "accessTokenVersion" INTEGER NOT NULL DEFAULT 1,
    "pickupCode" TEXT NOT NULL,
    "termsVersion" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "withdrawalRequestedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "variantLabel" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "refundedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShopOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" "ShopRefundReason" NOT NULL,
    "status" "ShopRefundStatus" NOT NULL DEFAULT 'PROCESSING',
    "mollieRefundId" TEXT,
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_organizationId_status_sortOrder_idx" ON "Product"("organizationId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_organizationId_name_idx" ON "Product"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_slug_key" ON "Product"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductOptionGroup_productId_sortOrder_idx" ON "ProductOptionGroup"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionGroup_productId_name_key" ON "ProductOptionGroup"("productId", "name");

-- CreateIndex
CREATE INDEX "ProductOptionValue_groupId_sortOrder_idx" ON "ProductOptionValue"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_groupId_name_key" ON "ProductOptionValue"("groupId", "name");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_sortOrder_idx" ON "ProductVariant"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_key_key" ON "ProductVariant"("productId", "key");

-- CreateIndex
CREATE INDEX "PickupPoint_organizationId_sortOrder_idx" ON "PickupPoint"("organizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShippingMethod_organizationId_sortOrder_idx" ON "ShippingMethod"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_reference_key" ON "ShopOrder"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_molliePaymentId_key" ON "ShopOrder"("molliePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_accessTokenHash_key" ON "ShopOrder"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_pickupCode_key" ON "ShopOrder"("pickupCode");

-- CreateIndex
CREATE INDEX "ShopOrder_organizationId_createdAt_idx" ON "ShopOrder"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopOrder_organizationId_status_fulfillmentStatus_idx" ON "ShopOrder"("organizationId", "status", "fulfillmentStatus");

-- CreateIndex
CREATE INDEX "ShopOrder_organizationId_buyerEmailKey_idx" ON "ShopOrder"("organizationId", "buyerEmailKey");

-- CreateIndex
CREATE INDEX "ShopOrder_organizationId_buyerLastName_idx" ON "ShopOrder"("organizationId", "buyerLastName");

-- CreateIndex
CREATE INDEX "ShopOrder_status_holdExpiresAt_idx" ON "ShopOrder"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "ShopOrder_pickupPointId_idx" ON "ShopOrder"("pickupPointId");

-- CreateIndex
CREATE INDEX "ShopOrder_shippingMethodId_idx" ON "ShopOrder"("shippingMethodId");

-- CreateIndex
CREATE INDEX "ShopOrderLine_orderId_idx" ON "ShopOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "ShopOrderLine_productId_idx" ON "ShopOrderLine"("productId");

-- CreateIndex
CREATE INDEX "ShopOrderLine_variantId_idx" ON "ShopOrderLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRefund_mollieRefundId_key" ON "ShopRefund"("mollieRefundId");

-- CreateIndex
CREATE INDEX "ShopRefund_orderId_idx" ON "ShopRefund"("orderId");

-- CreateIndex
CREATE INDEX "EventOption_productId_idx" ON "EventOption"("productId");

-- CreateIndex
CREATE INDEX "OrderOption_productVariantId_idx" ON "OrderOption"("productVariantId");

-- AddForeignKey
ALTER TABLE "EventOption" ADD CONSTRAINT "EventOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderOption" ADD CONSTRAINT "OrderOption_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingMethod" ADD CONSTRAINT "ShippingMethod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderLine" ADD CONSTRAINT "ShopOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderLine" ADD CONSTRAINT "ShopOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderLine" ADD CONSTRAINT "ShopOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRefund" ADD CONSTRAINT "ShopRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stocks, réservations et ventes jamais négatifs ; jamais plus de paniers en cours que d'unités disponibles ; prix et
-- taux de TVA dans leurs bornes ; montants des commandes cohérents
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_price_nonneg" CHECK ("priceMinor" >= 0),
  ADD CONSTRAINT "Product_vat_range" CHECK ("vatRateBps" >= 0 AND "vatRateBps" <= 3000);

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_counts_nonneg" CHECK ("held" >= 0 AND "sold" >= 0 AND ("stock" IS NULL OR "stock" >= 0)),
  ADD CONSTRAINT "ProductVariant_held_within_stock" CHECK ("stock" IS NULL OR "held" <= "stock"),
  ADD CONSTRAINT "ProductVariant_price_nonneg" CHECK ("priceDeltaMinor" >= 0);

ALTER TABLE "ShippingMethod"
  ADD CONSTRAINT "ShippingMethod_price_nonneg" CHECK ("priceMinor" >= 0);

ALTER TABLE "ShopOrder"
  ADD CONSTRAINT "ShopOrder_amounts_consistent" CHECK (
    "subtotalMinor" >= 0 AND "shippingMinor" >= 0 AND "totalMinor" = "subtotalMinor" + "shippingMinor"
    AND "vatMinor" >= 0 AND "vatMinor" <= "totalMinor"
    AND "refundedMinor" >= 0 AND "refundedMinor" <= "totalMinor"
  ),
  ADD CONSTRAINT "ShopOrder_shipping_vat_range" CHECK ("shippingVatBps" >= 0 AND "shippingVatBps" <= 3000);

ALTER TABLE "ShopOrderLine"
  ADD CONSTRAINT "ShopOrderLine_quantity_pos" CHECK ("quantity" >= 1 AND "refundedQuantity" >= 0 AND "refundedQuantity" <= "quantity"),
  ADD CONSTRAINT "ShopOrderLine_price_nonneg" CHECK ("unitPriceMinor" >= 0 AND "vatRateBps" >= 0 AND "vatRateBps" <= 3000);

ALTER TABLE "ShopRefund"
  ADD CONSTRAINT "ShopRefund_amount_pos" CHECK ("amountMinor" > 0);
