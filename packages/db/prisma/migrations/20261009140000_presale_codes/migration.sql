-- Prévente privée : codes qui ouvrent l'achat avant l'ouverture publique des ventes
ALTER TABLE "Event" ADD COLUMN "presaleStartsAt" TIMESTAMP(3);
CREATE TABLE "PresaleCode" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PresaleCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PresaleCode_eventId_code_key" ON "PresaleCode"("eventId", "code");
CREATE INDEX "PresaleCode_eventId_createdAt_idx" ON "PresaleCode"("eventId", "createdAt");
ALTER TABLE "PresaleCode" ADD CONSTRAINT "PresaleCode_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "presaleCodeId" TEXT;
CREATE INDEX "Order_presaleCodeId_status_idx" ON "Order"("presaleCodeId", "status");
ALTER TABLE "Order" ADD CONSTRAINT "Order_presaleCodeId_fkey" FOREIGN KEY ("presaleCodeId") REFERENCES "PresaleCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
