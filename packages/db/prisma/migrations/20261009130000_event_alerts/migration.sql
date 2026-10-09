-- « Prévenez-moi » : un e-mail à l'ouverture des ventes, avec l'accord explicite du visiteur
CREATE TABLE "EventAlert" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    CONSTRAINT "EventAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventAlert_token_key" ON "EventAlert"("token");
CREATE UNIQUE INDEX "EventAlert_eventId_email_key" ON "EventAlert"("eventId", "email");
CREATE INDEX "EventAlert_eventId_notifiedAt_idx" ON "EventAlert"("eventId", "notifiedAt");
ALTER TABLE "EventAlert" ADD CONSTRAINT "EventAlert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
