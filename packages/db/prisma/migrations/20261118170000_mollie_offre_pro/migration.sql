-- Passage à Mollie, lot 6 (docs/MOLLIE.md) : offre Pro payée par Mollie sur le compte d'Evoly. Evoly tient les périodes
-- et prélève chaque renouvellement sur le mandat ; chaque paiement reçu donne une facture numérotée.
-- CreateEnum
CREATE TYPE "SubscriptionPaymentKind" AS ENUM ('FIRST', 'SETTLE', 'RENEWAL', 'MANDATE');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('OPEN', 'PENDING', 'PAID', 'FAILED', 'CHARGED_BACK');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingProvider" "PaymentProvider",
ADD COLUMN     "mollieCustomerId" TEXT,
ADD COLUMN     "mollieMandateId" TEXT,
ADD COLUMN     "nextInterval" "BillingInterval",
ADD COLUMN     "paymentMethodLabel" TEXT,
ADD COLUMN     "renewalNoticeFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "molliePaymentId" TEXT,
    "kind" "SubscriptionPaymentKind" NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'OPEN',
    "interval" "BillingInterval",
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "renewalKey" TEXT,
    "method" TEXT,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "vatRateBps" INTEGER,
    "vatMinor" INTEGER NOT NULL DEFAULT 0,
    "vatMention" TEXT,
    "method" TEXT,
    "customer" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_molliePaymentId_key" ON "SubscriptionPayment"("molliePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_renewalKey_key" ON "SubscriptionPayment"("renewalKey");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_subscriptionId_createdAt_idx" ON "SubscriptionPayment"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_status_idx" ON "SubscriptionPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProInvoice_paymentId_key" ON "ProInvoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProInvoice_number_key" ON "ProInvoice"("number");

-- CreateIndex
CREATE INDEX "ProInvoice_organizationId_issuedAt_idx" ON "ProInvoice"("organizationId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_mollieCustomerId_key" ON "Subscription"("mollieCustomerId");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProInvoice" ADD CONSTRAINT "ProInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProInvoice" ADD CONSTRAINT "ProInvoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

