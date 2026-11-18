-- Passage à Mollie, lot 7 (docs/MOLLIE.md) : retrait de Stripe, sans reprise des données (seul le compte de test du
-- porteur avait relié Stripe). Les données Stripe sont d'abord retirées ou détachées, puis les tables, colonnes et
-- valeurs propres à Stripe sont supprimées.

-- Données Stripe : notifications et préférences, journal d'audit, prestataire des commandes et abonnements, contestations
DELETE FROM "Notification" WHERE "type" = 'STRIPE_ACTION_REQUIRED';
UPDATE "OrganizationMember"
SET "mutedNotifications" = array_remove("mutedNotifications", 'STRIPE_ACTION_REQUIRED'::"NotificationType"),
    "mutedEmails" = array_remove("mutedEmails", 'STRIPE_ACTION_REQUIRED'::"NotificationType")
WHERE 'STRIPE_ACTION_REQUIRED'::"NotificationType" = ANY ("mutedNotifications" || "mutedEmails");
UPDATE "AuditLog" SET "actorType" = 'SYSTEM' WHERE "actorType" = 'STRIPE';
UPDATE "Order" SET "paymentProvider" = NULL WHERE "paymentProvider" = 'STRIPE';
UPDATE "Subscription" SET "billingProvider" = NULL WHERE "billingProvider" = 'STRIPE';
DELETE FROM "Dispute"
WHERE "stripeDisputeId" IS NOT NULL
   OR "status" IN ('WARNING_NEEDS_RESPONSE', 'WARNING_UNDER_REVIEW', 'WARNING_CLOSED');

-- AlterEnum
BEGIN;
CREATE TYPE "ActorType_new" AS ENUM ('USER', 'SYSTEM', 'SCANNER', 'ADMIN');
ALTER TABLE "AuditLog" ALTER COLUMN "actorType" TYPE "ActorType_new" USING ("actorType"::text::"ActorType_new");
ALTER TYPE "ActorType" RENAME TO "ActorType_old";
ALTER TYPE "ActorType_new" RENAME TO "ActorType";
DROP TYPE "public"."ActorType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "DisputeStatus_new" AS ENUM ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'WON', 'LOST');
ALTER TABLE "Dispute" ALTER COLUMN "status" TYPE "DisputeStatus_new" USING ("status"::text::"DisputeStatus_new");
ALTER TYPE "DisputeStatus" RENAME TO "DisputeStatus_old";
ALTER TYPE "DisputeStatus_new" RENAME TO "DisputeStatus";
DROP TYPE "public"."DisputeStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('NEW_ORDER', 'SALES_MILESTONE', 'REFUND_REQUESTED', 'RESALE_SOLD', 'MEMBER_JOINED', 'SUBSCRIPTION_PAYMENT_FAILED', 'TRIAL_ENDING', 'DOMAIN_ACTIVE', 'DOMAIN_ERROR', 'EVENT_CANCELLED', 'CAMPAIGN_SENT', 'DISPUTE_OPENED', 'EVENT_PUBLISHED', 'PAYOUT_FAILED', 'BUYER_FLAGGED', 'MOLLIE_ACTION_REQUIRED');
ALTER TABLE "public"."OrganizationMember" ALTER COLUMN "mutedEmails" DROP DEFAULT;
ALTER TABLE "public"."OrganizationMember" ALTER COLUMN "mutedNotifications" DROP DEFAULT;
ALTER TABLE "OrganizationMember" ALTER COLUMN "mutedNotifications" TYPE "NotificationType_new"[] USING ("mutedNotifications"::text::"NotificationType_new"[]);
ALTER TABLE "OrganizationMember" ALTER COLUMN "mutedEmails" TYPE "NotificationType_new"[] USING ("mutedEmails"::text::"NotificationType_new"[]);
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
ALTER TABLE "OrganizationMember" ALTER COLUMN "mutedEmails" SET DEFAULT ARRAY[]::"NotificationType"[];
ALTER TABLE "OrganizationMember" ALTER COLUMN "mutedNotifications" SET DEFAULT ARRAY[]::"NotificationType"[];
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentProvider_new" AS ENUM ('MOLLIE');
ALTER TABLE "Subscription" ALTER COLUMN "billingProvider" TYPE "PaymentProvider_new" USING ("billingProvider"::text::"PaymentProvider_new");
ALTER TABLE "Order" ALTER COLUMN "paymentProvider" TYPE "PaymentProvider_new" USING ("paymentProvider"::text::"PaymentProvider_new");
ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";
DROP TYPE "public"."PaymentProvider_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "StripeAccount" DROP CONSTRAINT "StripeAccount_organizationId_fkey";

-- DropIndex
DROP INDEX "Dispute_stripeDisputeId_key";

-- DropIndex
DROP INDEX "Order_stripeChargeId_key";

-- DropIndex
DROP INDEX "Order_stripePaymentIntentId_key";

-- DropIndex
DROP INDEX "Refund_stripeRefundId_key";

-- DropIndex
DROP INDEX "ResaleListing_sellerStripeRefundId_key";

-- DropIndex
DROP INDEX "Subscription_stripeCustomerId_key";

-- DropIndex
DROP INDEX "Subscription_stripeSubscriptionId_key";

-- AlterTable
ALTER TABLE "CustomDomain" DROP COLUMN "applePayRegistered";

-- AlterTable
ALTER TABLE "Dispute" DROP COLUMN "stripeChargeId",
DROP COLUMN "stripeDisputeId";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "stripeChargeId",
DROP COLUMN "stripePaymentIntentId";

-- AlterTable
ALTER TABLE "PlanCurrencyTerms" DROP COLUMN "stripePriceIdMonthly",
DROP COLUMN "stripePriceIdYearly";

-- AlterTable
ALTER TABLE "Refund" DROP COLUMN "stripeRefundId";

-- AlterTable
ALTER TABLE "ResaleListing" DROP COLUMN "sellerStripeRefundId";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "stripeCustomerId",
DROP COLUMN "stripeSubscriptionId";

-- AlterTable
ALTER TABLE "VenuePayout" DROP COLUMN "stripeTransferId";

-- DropTable
DROP TABLE "StripeAccount";

-- DropTable
DROP TABLE "StripeWebhookEvent";

-- DropEnum
DROP TYPE "StripeAccountStatus";

-- DropEnum
DROP TYPE "WebhookStatus";

