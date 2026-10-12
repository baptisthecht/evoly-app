-- Liste d'attente (section 9.30) : une inscription par adresse et par tarif complet
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'PURCHASED', 'EXPIRED', 'CANCELLED');
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "offeredQuantity" INTEGER,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "token" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WaitlistEntry_quantity_range" CHECK ("quantity" BETWEEN 1 AND 4),
    CONSTRAINT "WaitlistEntry_offered_range" CHECK ("offeredQuantity" IS NULL OR "offeredQuantity" BETWEEN 1 AND "quantity")
);
CREATE UNIQUE INDEX "WaitlistEntry_token_key" ON "WaitlistEntry"("token");
CREATE UNIQUE INDEX "WaitlistEntry_ticketTypeId_email_key" ON "WaitlistEntry"("ticketTypeId", "email");
CREATE INDEX "WaitlistEntry_ticketTypeId_status_createdAt_idx" ON "WaitlistEntry"("ticketTypeId", "status", "createdAt");
CREATE INDEX "WaitlistEntry_eventId_status_idx" ON "WaitlistEntry"("eventId", "status");
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
