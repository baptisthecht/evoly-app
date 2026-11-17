-- Boutique (lot 3b) : commandes de la boutique, séparées des commandes de billets (qui exigent un événement) ;
-- lignes figées à l'achat (nom, options, prix, TVA) et remboursements. Montants cohérents garantis par la base.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SHOP_ORDER_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'SHOP_WITHDRAWAL';

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
    "paymentFeeMinor" INTEGER,
    "netMinor" INTEGER,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
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

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopOrder_amounts_consistent" CHECK (
      "subtotalMinor" >= 0 AND "shippingMinor" >= 0 AND "totalMinor" = "subtotalMinor" + "shippingMinor"
      AND "vatMinor" >= 0 AND "vatMinor" <= "totalMinor"
      AND "refundedMinor" >= 0 AND "refundedMinor" <= "totalMinor"
    )
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

    CONSTRAINT "ShopOrderLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopOrderLine_quantity_pos" CHECK ("quantity" >= 1 AND "refundedQuantity" >= 0 AND "refundedQuantity" <= "quantity"),
    CONSTRAINT "ShopOrderLine_price_nonneg" CHECK ("unitPriceMinor" >= 0 AND "vatRateBps" >= 0 AND "vatRateBps" <= 3000)
);

-- CreateTable
CREATE TABLE "ShopRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" "ShopRefundReason" NOT NULL,
    "status" "ShopRefundStatus" NOT NULL DEFAULT 'PROCESSING',
    "stripeRefundId" TEXT,
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRefund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopRefund_amount_pos" CHECK ("amountMinor" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_reference_key" ON "ShopOrder"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_stripePaymentIntentId_key" ON "ShopOrder"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_stripeChargeId_key" ON "ShopOrder"("stripeChargeId");

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
CREATE INDEX "ShopOrderLine_orderId_idx" ON "ShopOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "ShopOrderLine_productId_idx" ON "ShopOrderLine"("productId");

-- CreateIndex
CREATE INDEX "ShopOrderLine_variantId_idx" ON "ShopOrderLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRefund_stripeRefundId_key" ON "ShopRefund"("stripeRefundId");

-- CreateIndex
CREATE INDEX "ShopRefund_orderId_idx" ON "ShopRefund"("orderId");

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderLine" ADD CONSTRAINT "ShopOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderLine" ADD CONSTRAINT "ShopOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderLine" ADD CONSTRAINT "ShopOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRefund" ADD CONSTRAINT "ShopRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

