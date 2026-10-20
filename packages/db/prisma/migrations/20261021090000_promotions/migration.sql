-- Offres commerciales gérées en base (docs/OFFRES.md)
-- CreateEnum
CREATE TYPE "PromotionAudience" AS ENUM ('ALL_NEW', 'LINK');

-- CreateEnum
CREATE TYPE "PromotionDurationUnit" AS ENUM ('DAY', 'MONTH');

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "planId" TEXT NOT NULL DEFAULT 'pro',
    "durationValue" INTEGER NOT NULL DEFAULT 3,
    "durationUnit" "PromotionDurationUnit" NOT NULL DEFAULT 'MONTH',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "audience" "PromotionAudience" NOT NULL DEFAULT 'ALL_NEW',
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationTypes" "OrganizationType"[] DEFAULT ARRAY[]::"OrganizationType"[],
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "perOwnerLimit" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "showOnSite" BOOLEAN NOT NULL DEFAULT true,
    "messages" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_organizationId_key" ON "PromotionRedemption"("organizationId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promotionId_createdAt_idx" ON "PromotionRedemption"("promotionId", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionRedemption_userId_idx" ON "PromotionRedemption"("userId");

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise de l'offre de lancement, jusque-là écrite dans le code : 3 mois de Pro pour toute nouvelle organisation
-- créée au plus tard le 31 mars 2027 à 23 h 59 (heure de Bruxelles). Gérée désormais depuis l'administration.
INSERT INTO "Promotion" ("id", "code", "name", "note", "active", "planId", "durationValue", "durationUnit", "startsAt", "endsAt", "audience", "perOwnerLimit", "priority", "showOnSite", "messages", "createdAt", "updatedAt")
VALUES ('promo_lancement_2026', 'lancement-2026', 'Offre de lancement', 'Reprise de l''offre écrite dans le code (octobre 2026).', true, 'pro', 3, 'MONTH', NULL, '2027-03-31 21:59:59+00', 'ALL_NEW', 1, 0, true, '{"fr": {"banner": "Offre de lancement : 3 mois de Pro offerts, sans carte bancaire, pour toute organisation créée au plus tard le 31 mars 2027.", "short": "3 mois offerts sans carte bancaire (offre de lancement)", "cta": "Profiter de 3 mois de Pro"}, "en": {"banner": "Launch offer: 3 months of Pro free, no credit card, for any organisation created by 31 March 2027.", "short": "3 months free, no credit card (launch offer)", "cta": "Get 3 months of Pro"}, "nl": {"banner": "Lanceringsaanbod: 3 maanden Pro gratis, zonder creditcard, voor elke organisatie die uiterlijk op 31 maart 2027 wordt aangemaakt.", "short": "3 maanden gratis, zonder creditcard (lanceringsaanbod)", "cta": "3 maanden Pro gratis"}, "de": {"banner": "Startangebot: 3 Monate Pro geschenkt, ohne Kreditkarte, für jede Organisation, die bis zum 31. März 2027 erstellt wird.", "short": "3 Monate geschenkt, ohne Kreditkarte (Startangebot)", "cta": "3 Monate Pro sichern"}, "es": {"banner": "Oferta de lanzamiento: 3 meses de Pro gratis, sin tarjeta, para toda organización creada hasta el 31 de marzo de 2027.", "short": "3 meses gratis, sin tarjeta (oferta de lanzamiento)", "cta": "Disfrutar de 3 meses de Pro"}, "it": {"banner": "Offerta di lancio: 3 mesi di Pro in regalo, senza carta di credito, per ogni organizzazione creata entro il 31 marzo 2027.", "short": "3 mesi in regalo, senza carta di credito (offerta di lancio)", "cta": "Approfitta di 3 mesi di Pro"}, "pt": {"banner": "Oferta de lançamento: 3 meses de Pro grátis, sem cartão, para qualquer organização criada até 31 de março de 2027.", "short": "3 meses grátis, sem cartão (oferta de lançamento)", "cta": "Aproveitar 3 meses de Pro"}}'::jsonb, now(), now())
ON CONFLICT ("code") DO NOTHING;
