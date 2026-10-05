-- Blocs personnalisés des e-mails de billets et de rappel (éditeur visuel)
ALTER TABLE "Event" ADD COLUMN "ticketEmailContent" JSONB,
ADD COLUMN "reminderEmailContent" JSONB;
