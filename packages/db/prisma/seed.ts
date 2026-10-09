// Données de départ : offres Free et Pro, rôles système.
// Valeurs de référence : docs/CDC.md, section 3 (modèle économique) et annexe B (rôles).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Permission, type PlanFeature, type SystemRole } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const FREE_FEATURES: PlanFeature[] = ["RESALE", "LIVE_STATS", "QR_CHECKIN", "EVOLY_SUBDOMAIN", "TRANSACTIONAL_EMAILS", "PROMO_CODES", "WALLET_PASSES"];

const PRO_FEATURES: PlanFeature[] = [
  ...FREE_FEATURES,
  "DYNAMIC_PRICING",
  "EMAIL_MARKETING",
  "BRANDING",
  "REMOVE_EVOLY_BRANDING",
  "CUSTOM_DOMAINS",
  "EVENT_SUBDOMAINS",
  "TEAM_MEMBERS",
  "CUSTOM_ROLES",
  "MULTI_ORGANIZATIONS",
  "SEATING_MAPS",
  "PRESALE_CODES",
];

const ALL: Permission[] = [
  "ORG_SETTINGS_EDIT",
  "BRAND_EDIT",
  "DOMAINS_MANAGE",
  "BILLING_MANAGE",
  "PAYMENTS_MANAGE",
  "FINANCE_VIEW",
  "MEMBERS_MANAGE",
  "ROLES_MANAGE",
  "EVENTS_CREATE",
  "EVENTS_EDIT",
  "EVENTS_PUBLISH",
  "EVENTS_CANCEL",
  "EVENTS_DELETE",
  "TICKETS_MANAGE",
  "PROMO_MANAGE",
  "ORDERS_VIEW",
  "ORDERS_MANAGE",
  "REFUNDS_MANAGE",
  "RESALE_MANAGE",
  "CHECKIN_SCAN",
  "CHECKIN_MANAGE",
  "STATS_VIEW",
  "MARKETING_MANAGE",
  "CONTACTS_EXPORT",
];

const SYSTEM_ROLES: { key: SystemRole; name: string; description: string; permissions: Permission[] }[] = [
  { key: "OWNER", name: "Propriétaire", description: "Tous les droits, y compris supprimer l'organisation et transférer la propriété.", permissions: ALL },
  { key: "ADMIN", name: "Administrateur", description: "Tous les droits sauf les actions réservées au propriétaire.", permissions: ALL },
  {
    key: "MANAGER",
    name: "Gestion des événements",
    description: "Crée, vend et opère les événements, sans les finances ni les réglages.",
    permissions: [
      "EVENTS_CREATE",
      "EVENTS_EDIT",
      "EVENTS_PUBLISH",
      "EVENTS_CANCEL",
      "TICKETS_MANAGE",
      "PROMO_MANAGE",
      "ORDERS_VIEW",
      "ORDERS_MANAGE",
      "REFUNDS_MANAGE",
      "RESALE_MANAGE",
      "CHECKIN_SCAN",
      "CHECKIN_MANAGE",
      "STATS_VIEW",
      "MARKETING_MANAGE",
    ],
  },
  {
    key: "BOX_OFFICE",
    name: "Billetterie",
    description: "Suit les commandes, gère remboursements et revente, scanne les entrées.",
    permissions: ["ORDERS_VIEW", "ORDERS_MANAGE", "REFUNDS_MANAGE", "RESALE_MANAGE", "CHECKIN_SCAN", "STATS_VIEW"],
  },
  { key: "SCANNER", name: "Contrôle des entrées", description: "Accès au scanner uniquement.", permissions: ["CHECKIN_SCAN"] },
  { key: "VIEWER", name: "Lecture seule", description: "Consulte les statistiques et les commandes.", permissions: ["STATS_VIEW", "ORDERS_VIEW"] },
];

async function main() {
  await prisma.plan.upsert({
    where: { id: "free" },
    create: { id: "free", name: "Free", feeRateBps: 200, trialDays: 0, features: FREE_FEATURES, sortOrder: 0 },
    update: { feeRateBps: 200, features: FREE_FEATURES },
  });
  await prisma.plan.upsert({
    where: { id: "pro" },
    create: { id: "pro", name: "Pro", feeRateBps: 200, trialDays: 14, features: PRO_FEATURES, sortOrder: 1 },
    update: { feeRateBps: 200, trialDays: 14, features: PRO_FEATURES },
  });
  // offre Partenaire : Pro offert par Evoly, sans commission, attribuée par les administrateurs (non publique)
  await prisma.plan.upsert({
    where: { id: "partner" },
    create: { id: "partner", name: "Partenaire", feeRateBps: 0, trialDays: 0, features: PRO_FEATURES, isPublic: false, sortOrder: 2 },
    update: { feeRateBps: 0, trialDays: 0, features: PRO_FEATURES, isPublic: false },
  });

  const terms = [
    { planId: "free", currency: "EUR", feeFixedMinor: 29, feeCapMinor: 250, monthlyPriceMinor: 0, yearlyPriceMinor: 0 },
    { planId: "pro", currency: "EUR", feeFixedMinor: 29, feeCapMinor: 100, monthlyPriceMinor: 2900, yearlyPriceMinor: 29580 },
    { planId: "partner", currency: "EUR", feeFixedMinor: 0, feeCapMinor: 0, monthlyPriceMinor: 0, yearlyPriceMinor: 0 },
  ];
  for (const t of terms) {
    await prisma.planCurrencyTerms.upsert({
      where: { planId_currency: { planId: t.planId, currency: t.currency } },
      create: t,
      update: t,
    });
  }

  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { systemKey: r.key },
      create: { systemKey: r.key, name: r.name, description: r.description, permissions: r.permissions },
      update: { name: r.name, description: r.description, permissions: r.permissions },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
