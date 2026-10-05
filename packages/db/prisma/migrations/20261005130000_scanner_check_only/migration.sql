-- Liens bénévoles en vérification seule : le scan contrôle le billet sans valider l'entrée
ALTER TABLE "ScannerLink" ADD COLUMN "checkOnly" BOOLEAN NOT NULL DEFAULT false;
