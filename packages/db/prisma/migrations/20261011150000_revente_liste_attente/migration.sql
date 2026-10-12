-- Section 9.30 : places en revente proposées d'abord aux inscrits de la liste d'attente, au choix de l'organisateur
ALTER TABLE "Event" ADD COLUMN "resaleWaitlistFirst" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "resaleWaitlistMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Event" ADD CONSTRAINT "Event_resaleWaitlistMinutes_range" CHECK ("resaleWaitlistMinutes" BETWEEN 5 AND 10080);
ALTER TABLE "ResaleListing" ADD COLUMN "publicFrom" TIMESTAMP(3);
