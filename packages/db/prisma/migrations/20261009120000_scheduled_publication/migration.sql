-- Publication programmée des événements : invisible ou annonce avant la date, lien d'aperçu secret, e-mail à l'organisation
CREATE TYPE "PrePublishMode" AS ENUM ('HIDDEN', 'TEASER');
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_PUBLISHED';
ALTER TABLE "Event"
  ADD COLUMN "publishAt" TIMESTAMP(3),
  ADD COLUMN "prePublishMode" "PrePublishMode" NOT NULL DEFAULT 'HIDDEN',
  ADD COLUMN "teaserText" TEXT,
  ADD COLUMN "previewToken" TEXT,
  ADD COLUMN "publishNotifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Event_previewToken_key" ON "Event"("previewToken");
CREATE INDEX "Event_publishAt_idx" ON "Event"("publishAt");
