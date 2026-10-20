-- Visites des billetteries : comptage anonyme, sans cookie ni donnée personnelle
ALTER TABLE "EventDailyStat" ADD COLUMN "pageViews" INTEGER NOT NULL DEFAULT 0;
