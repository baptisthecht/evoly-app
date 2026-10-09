-- Virement échoué (webhook payout.failed) et préférences de notification par membre (P1)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYOUT_FAILED';
ALTER TABLE "OrganizationMember" ADD COLUMN "mutedNotifications" "NotificationType"[] NOT NULL DEFAULT ARRAY[]::"NotificationType"[];
ALTER TABLE "OrganizationMember" ADD COLUMN "mutedEmails" "NotificationType"[] NOT NULL DEFAULT ARRAY[]::"NotificationType"[];
