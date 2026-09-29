# EVENLY — Cahier des Charges Complet

> Document de référence pour le développement. Toute décision d'implémentation doit être cohérente avec ce document.

---

## Table des matières

1. [Vision & Positionnement](#1-vision--positionnement)
2. [Modèle économique](#2-modèle-économique)
3. [Architecture technique](#3-architecture-technique)
4. [Contraintes transversales](#4-contraintes-transversales)
5. [Schéma de base de données](#5-schéma-de-base-de-données)
6. [Segment 1 — Auth & Onboarding](#6-segment-1--auth--onboarding)
7. [Segment 2 — Plan & Billing](#7-segment-2--plan--billing)
8. [Segment 3 — Dashboard organisateur](#8-segment-3--dashboard-organisateur)
9. [Segment 4 — Création & gestion d'événements](#9-segment-4--création--gestion-dévénements)
10. [Segment 5 — Page événement publique & billetterie](#10-segment-5--page-événement-publique--billetterie)
11. [Segment 6 — Paiement & Stripe Connect](#11-segment-6--paiement--stripe-connect)
12. [Segment 7 — QR Check-in scanner](#12-segment-7--qr-check-in-scanner)
13. [Segment 8 — Email marketing](#13-segment-8--email-marketing)
14. [Segment 9 — Sous-domaines & domaines custom](#14-segment-9--sous-domaines--domaines-custom)
15. [Segment 10 — Landing page](#15-segment-10--landing-page)
16. [Ordre de développement recommandé](#16-ordre-de-développement-recommandé)

---

## 1. Vision & Positionnement

### Concept
Evenly est une plateforme SaaS de billetterie événementielle transparente. Alternative directe à Eventbrite, positionnée sur la transparence totale des frais et l'absence de mauvaises surprises.

**Tagline** : *"La billetterie honnête. Zéro surprise, zéro arnaque."*

### Marché cible
- Associations, collectifs, indépendants
- PME organisant des événements réguliers
- Organisateurs frustrés par les frais cachés d'Eventbrite
- Marchés FR + EU (lancement), international ensuite

### Timing
Eventbrite a été racheté par Bending Spoons en décembre 2025 (500M$). Des changements tarifaires sont attendus courant 2026. C'est une fenêtre d'opportunité directe.

### Concurrence

| Plateforme | Commission | Limites |
|---|---|---|
| Eventbrite | ~6.6% + 1.79€/ticket + 2.9% processing | Frais cachés, expérience datée |
| HelloAsso | 0% (dons volontaires) | FR uniquement, associations seulement, don pré-coché ~20% |
| Evenly | 0% gratuits, 5% payants (Free) / 2.5% (Pro) | — |

### Différenciation clé
1. Transparence totale — frais affichés avant publication ET à l'acheteur avant paiement
2. 0% sur tickets gratuits, toujours, sans limite de volume
3. Multi-organisation avec rôles granulaires
4. Sous-domaines et domaines custom (Pro)
5. Aucun don pré-coché, aucun frais caché côté acheteur

---

## 2. Modèle économique

### Plans

| | Free | Pro |
|---|---|---|
| Abonnement | 0€ | 29€/mois ou 249€/an |
| Tickets gratuits | 0% ∞ | 0% ∞ |
| Quota mensuel offert | 30 tickets payants | 150 tickets payants |
| Commission au-delà du quota | **5%** | **2.5%** |
| Essai Pro | — | 14 jours gratuit (CB requise) |

### Simulation (300 tickets à 40€ = CA 12 000€)
- Eventbrite : ~1 950€
- Evenly Free : 432€ (économie 78%)
- Evenly Pro : 109€ (économie 94%)

### Plans stockés en DB
Les paramètres de plans sont stockés en base (table `Plan`) et modifiables sans redéploiement :
- `commissionRate`, `monthlyFreeQuota`, `monthlyPrice`, `yearlyPrice`, `stripePriceIdMonthly`, `stripePriceIdYearly`

### Gestion des impayés Pro
- 1 tentative de prélèvement par jour pendant 7 jours
- Email d'alerte quotidien
- Downgrade automatique Free à J+7
- Pas de remboursement prorata, downgrade en fin de période

### Moyens de paiement acceptés
- Abonnement Pro : CB, PayPal, Apple Pay, Google Pay (via Stripe Billing)
- Billetterie : Stripe Connect Express (argent → organisateur, commission prélevée via `application_fee_amount`)

---

## 3. Architecture technique

### Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js 14 App Router (fullstack) |
| Monorepo | Turborepo + pnpm workspaces |
| Base de données | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js v5 |
| Paiement | Stripe Connect Express + Stripe Billing |
| Email | Resend + React Email |
| Storage | Cloudflare R2 |
| Déploiement | Coolify (self-hosted) |
| Haptics | `web-haptics` (npm: haptics.lochie.me) |
| Animations | Framer Motion |

### Structure monorepo

```
evenly/
├── apps/
│   ├── web/          → evenly.com (landing marketing)
│   ├── app/          → app.evenly.com (dashboard + pages events publiques)
│   └── scanner/      → scanner.evenly.com (PWA check-in mobile)
└── packages/
    ├── db/           → Prisma schema + client singleton
    ├── core/         → Business logic pure (framework-agnostic)
    │   ├── events/
    │   ├── tickets/
    │   ├── billing/
    │   └── organizers/
    ├── ui/           → Composants React partagés
    ├── email/        → Templates React Email
    └── config/       → tsconfig, eslint partagés
```

**Règle absolue** : `packages/core` ne doit jamais importer Next.js, React, ou tout framework UI. Business logic pure, testable unitairement, extractible vers NestJS si besoin.

### Routing par sous-domaine (middleware Next.js — app/)

```
evenly.com                    → Landing page (apps/web)
app.evenly.com                → Dashboard
scanner.evenly.com            → PWA Scanner
[slug].evenly.com             → Page org ou événement (lookup DB par subdomain)
[custom-domain]               → Page org ou événement (lookup DB par customDomain)
```

Le middleware lit le header `host`, effectue un lookup DB, et rewrite vers la route interne correspondante.

---

## 4. Contraintes transversales

Ces contraintes s'appliquent à TOUS les segments sans exception.

### 4.1 Mobile first
- Toutes les interfaces sont conçues mobile first
- Breakpoints : mobile (< 768px), tablet (768-1024px), desktop (> 1024px)
- Les tableaux complexes deviennent des cards scrollables sur mobile
- Les drawers/modals prennent 100% de la hauteur sur mobile

### 4.2 Haptics
- Librairie : `web-haptics` (npm)
- Utilisation sur les actions clés uniquement — pas sur chaque interaction
- Patterns à appliquer :
  - ✅ Succès (scan valide, paiement OK, sauvegarde) → vibration courte légère
  - ❌ Erreur (scan invalide, paiement échoué, validation KO) → vibration longue
  - ⚠️ Warning (quota atteint, alerte) → double vibration courte
  - 🎯 CTA important (bouton "Publier", "Payer") → micro-vibration au tap
- Respecter `prefers-reduced-motion` — désactiver les haptics si activé

### 4.3 Internationalisation (i18n)
- Langue par défaut : Français
- Seconde langue : Anglais
- Routing : `evenly.com` (FR), `evenly.com/en` (EN)
- Toutes les chaînes dans `/locales/fr.json` et `/locales/en.json`
- Détection automatique via `Accept-Language` au premier accès, mémorisé en cookie

### 4.4 Accessibilité
- Score Lighthouse Accessibility cible : 100
- Tous les éléments interactifs ont un label ARIA
- Navigation clavier complète
- Contraste minimum WCAG AA

### 4.5 Performance
- Score Lighthouse Performance cible : 95+
- Images optimisées via Next.js Image
- Lazy loading sur les sections sous la fold
- Code splitting automatique par route

---

## 5. Schéma de base de données

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  avatarUrl     String?
  emailVerified DateTime?
  passwordHash  String?   // null si OAuth only
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts                Account[]
  sessions                Session[]
  organizationMemberships OrganizationMember[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  provider          String  // "google" | "apple" | "credentials"
  providerAccountId String
  accessToken       String?
  refreshToken      String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id                   String   @id @default(cuid())
  userId               String
  sessionToken         String   @unique
  expires              DateTime
  lastOrganizationId   String?  // dernière org active mémorisée

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ─────────────────────────────────────────
// ORGANISATIONS & RÔLES
// ─────────────────────────────────────────

model Organization {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  logoUrl     String?
  description String?
  email       String?
  timezone    String   @default("Europe/Paris")
  type        OrgType  @default(INDIVIDUAL) // INDIVIDUAL | ASSOCIATION | COMPANY

  // Plan & billing
  planId              String         @default("free")
  stripeCustomerId    String?        @unique
  stripeSubscriptionId String?       @unique
  subscriptionStatus  SubStatus      @default(INACTIVE)
  subscriptionEndsAt  DateTime?
  trialEndsAt         DateTime?

  // Stripe Connect (pour recevoir les paiements billetterie)
  stripeAccountId       String?  @unique
  stripeAccountStatus   StripeAccountStatus @default(NOT_CONNECTED)

  // Finances
  availableBalanceCents Int @default(0)
  reservedBalanceCents  Int @default(0)

  // Quota commission
  ticketsSoldThisMonth Int      @default(0)
  quotaResetAt         DateTime?

  // Domaines
  subdomain          String?  @unique
  previousSubdomain  String?
  subdomainChangedAt DateTime?

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  plan          Plan                 @relation(fields: [planId], references: [id])
  members       OrganizationMember[]
  roles         Role[]
  events        Event[]
  customDomains CustomDomain[]
  invitations   Invitation[]
  payouts       Payout[]
  reserves      Reserve[]
  emailTemplates EmailTemplate[]
  unsubscribes  EmailUnsubscribe[]
}

enum OrgType {
  INDIVIDUAL
  ASSOCIATION
  COMPANY
}

enum SubStatus {
  INACTIVE
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
}

enum StripeAccountStatus {
  NOT_CONNECTED
  PENDING
  ACTIVE
  RESTRICTED
  RESTRICTED_SOON
}

model Plan {
  id                   String  @id // "free" | "pro"
  name                 String
  commissionRate       Float   // 0.05 pour 5%
  monthlyFreeQuota     Int     // 30 pour Free, 150 pour Pro
  monthlyPriceCents    Int     // 0 pour Free, 2900 pour Pro
  yearlyPriceCents     Int     // 0 pour Free, 24900 pour Pro
  stripePriceIdMonthly String?
  stripePriceIdYearly  String?

  organizations Organization[]
}

model Role {
  id             String  @id @default(cuid())
  organizationId String? // null = rôle système global
  name           String
  isSystem       Boolean @default(false) // Admin, Member = non supprimables
  permissions    Permission[]

  organization Organization?        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  members      OrganizationMember[]
}

enum Permission {
  EVENTS_CREATE
  EVENTS_EDIT
  EVENTS_DELETE
  EVENTS_PUBLISH
  TICKETS_VIEW
  TICKETS_REFUND
  CHECKIN_SCAN
  MEMBERS_INVITE
  MEMBERS_REMOVE
  MEMBERS_MANAGE_ROLES
  FINANCE_VIEW
  FINANCE_MANAGE
  SETTINGS_EDIT
  BILLING_MANAGE
  ROLES_CREATE
  ROLES_EDIT
  ROLES_DELETE
}

model OrganizationMember {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  roleId         String
  joinedAt       DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role         Role         @relation(fields: [roleId], references: [id])

  @@unique([organizationId, userId])
}

model Invitation {
  id             String           @id @default(cuid())
  organizationId String
  email          String
  roleId         String
  token          String           @unique @default(cuid())
  status         InvitationStatus @default(PENDING)
  expiresAt      DateTime
  createdBy      String
  createdAt      DateTime         @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  CANCELLED
}

// ─────────────────────────────────────────
// ÉVÉNEMENTS
// ─────────────────────────────────────────

model Event {
  id             String      @id @default(cuid())
  organizationId String
  slug           String
  title          String
  description    String?     // rich text HTML
  bannerUrl      String?

  status       EventStatus @default(DRAFT)
  locationType LocationType

  // Lieu physique
  locationName    String?
  locationAddress String?
  locationLat     Float?
  locationLng     Float?

  // Lieu en ligne
  streamUrl String? // révélé uniquement après achat

  startsAt  DateTime
  endsAt    DateTime?
  timezone  String

  // Placement
  seatingType     SeatingType @default(FREE) // FREE | ASSIGNED
  allowSeatChoice Boolean     @default(true) // si ASSIGNED : l'acheteur peut choisir sa place

  // Personnalisation Pro
  primaryColor String?
  accentColor  String?
  visibility   EventVisibility @default(PUBLIC) // PUBLIC | UNLISTED

  // Message post-achat
  confirmationMessage String?

  // Domaine dédié
  subdomain String? @unique

  // Paramètres remboursement
  refundPolicy     RefundPolicy @default(ORGANIZER_DEFINED)
  refundDeadlineDays Int?       // null si non remboursable ou toujours remboursable

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  organization   Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  ticketTypes    TicketType[]
  orders         Order[]
  promoCodes     PromoCode[]
  seatingMap     SeatingMap?
  customDomains  CustomDomain[]
  automations    EmailAutomation[]
  campaigns      EmailCampaign[]
  scannerLinks   ScannerLink[]

  @@unique([organizationId, slug])
}

enum EventStatus {
  DRAFT
  PUBLISHED
  CANCELLED
  ENDED
}

enum LocationType {
  PHYSICAL
  ONLINE
  HYBRID
}

enum SeatingType {
  FREE      // Pas de plan, juste des catégories avec quota
  ASSIGNED  // Plan de salle avec rangs et sièges
}

enum EventVisibility {
  PUBLIC
  UNLISTED
}

enum RefundPolicy {
  NON_REFUNDABLE
  ORGANIZER_DEFINED  // refundDeadlineDays jours avant
  ALWAYS_REFUNDABLE
}

// ─────────────────────────────────────────
// PLAN DE SALLE (SeatingType = ASSIGNED)
// ─────────────────────────────────────────

model SeatingMap {
  id      String @id @default(cuid())
  eventId String @unique

  categories SeatingCategory[]
  rows       SeatingRow[]

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

model SeatingCategory {
  id           String @id @default(cuid())
  seatingMapId String
  name         String  // ex: "Carré Or", "Fosse", "Balcon"
  color        String  // couleur hex pour le plan
  ticketTypeId String? // type de ticket associé à cette catégorie

  seatingMap SeatingMap @relation(fields: [seatingMapId], references: [id], onDelete: Cascade)
  seats      Seat[]
}

model SeatingRow {
  id           String @id @default(cuid())
  seatingMapId String
  categoryId   String
  name         String // ex: "A", "B", "1", "2"
  sortOrder    Int

  seatingMap SeatingMap @relation(fields: [seatingMapId], references: [id], onDelete: Cascade)
  seats      Seat[]
}

model Seat {
  id         String    @id @default(cuid())
  rowId      String
  categoryId String
  label      String    // ex: "A12", "B03"
  status     SeatStatus @default(AVAILABLE)

  row      SeatingRow      @relation(fields: [rowId], references: [id], onDelete: Cascade)
  category SeatingCategory @relation(fields: [categoryId], references: [id])
  ticket   Ticket?
}

enum SeatStatus {
  AVAILABLE
  RESERVED   // réservé temporairement (10 min pendant checkout)
  SOLD
  BLOCKED    // bloqué par l'organisateur
}

// ─────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────

model TicketType {
  id          String @id @default(cuid())
  eventId     String
  name        String
  description String?
  priceCents  Int    // 0 = gratuit
  currency    String @default("EUR")

  quantity     Int?   // null = illimité
  quantitySold Int    @default(0)

  status TicketTypeStatus @default(ACTIVE)

  saleStartsAt DateTime?
  saleEndsAt   DateTime?
  minPerOrder  Int @default(1)
  maxPerOrder  Int @default(10)
  sortOrder    Int @default(0)

  isNominative Boolean @default(false) // si true : formulaire par ticket
  customFields Json?   // définition des champs custom [{label, type, required}]

  // Pour SeatingType = ASSIGNED
  seatingCategoryId String? // catégorie de salle associée

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

enum TicketTypeStatus {
  ACTIVE
  HIDDEN
  SOLD_OUT
}

model PromoCode {
  id      String @id @default(cuid())
  eventId String
  code    String

  type  PromoType
  value Float     // pourcentage (0-100) ou montant en centimes

  ticketTypeIds   String[] // vide = tous les types
  maxUses         Int?
  maxUsesPerEmail Int?
  expiresAt       DateTime?
  usedCount       Int      @default(0)
  isActive        Boolean  @default(true)

  createdAt DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, code])
}

enum PromoType {
  PERCENTAGE
  FIXED
  FREE // 100% → bypass Stripe
}

// ─────────────────────────────────────────
// COMMANDES & BILLETS
// ─────────────────────────────────────────

model Order {
  id      String @id @default(cuid())
  eventId String

  // Acheteur
  buyerEmail     String
  buyerFirstName String
  buyerLastName  String
  buyerPhone     String?

  // Compte optionnel
  userId String? // null = guest checkout

  // Montants
  subtotalCents     Int
  discountCents     Int    @default(0)
  feesCents         Int    // commission Evenly
  totalCents        Int
  currency          String @default("EUR")

  // Promo
  promoCodeId String?

  // Stripe
  stripePaymentIntentId    String? @unique
  stripeCheckoutSessionId  String? @unique

  status OrderStatus @default(PENDING)

  // Token magique pour accès sans compte
  magicToken String @unique @default(cuid())

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  event   Event       @relation(fields: [eventId], references: [id])
  items   OrderItem[]
  tickets Ticket[]
  refundRequests RefundRequest[]
}

enum OrderStatus {
  PENDING
  COMPLETED
  CANCELLED
  REFUNDED
  PARTIALLY_REFUNDED
}

model OrderItem {
  id           String @id @default(cuid())
  orderId      String
  ticketTypeId String
  quantity     Int
  unitPriceCents Int
  customFields  Json? // réponses aux champs custom

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
}

model Ticket {
  id          String @id @default(cuid())
  orderId     String
  orderItemId String

  qrCode String @unique @default(cuid())

  // Titulaire (si nominatif)
  holderFirstName String?
  holderLastName  String?
  holderEmail     String?
  holderPhone     String?
  customFields    Json?

  // Placement assigné
  seatId String? @unique

  // Check-in
  checkedIn   Boolean   @default(false)
  checkedInAt DateTime?
  checkedInBy String?   // userId ou scannerLinkId

  status TicketStatus @default(ACTIVE)

  createdAt DateTime @default(now())

  order Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  seat  Seat?  @relation(fields: [seatId], references: [id])
}

enum TicketStatus {
  ACTIVE
  USED
  CANCELLED
  REFUNDED
}

model RefundRequest {
  id      String @id @default(cuid())
  orderId String

  ticketIds String[] // tickets concernés par le remboursement
  reason    String?
  status    RefundStatus @default(PENDING)
  isOutOfDeadline Boolean @default(false)

  // Réponse organisateur
  responseMessage String?
  respondedAt     DateTime?
  respondedBy     String?   // userId

  createdAt DateTime @default(now())

  order Order @relation(fields: [orderId], references: [id])
}

enum RefundStatus {
  PENDING
  APPROVED
  REJECTED
  PROCESSED
}

// ─────────────────────────────────────────
// PAIEMENTS & FINANCES
// ─────────────────────────────────────────

model Reserve {
  id             String        @id @default(cuid())
  organizationId String
  orderId        String
  amountCents    Int           // 20% du montant de la commande
  releasesAt     DateTime      // now() + 30 jours
  releasedAt     DateTime?
  status         ReserveStatus @default(HELD)

  organization Organization @relation(fields: [organizationId], references: [id])
}

enum ReserveStatus {
  HELD
  RELEASED
}

model Payout {
  id             String       @id @default(cuid())
  organizationId String
  amountCents    Int
  stripePayoutId String?      @unique
  status         PayoutStatus @default(PENDING)
  requestedAt    DateTime     @default(now())
  paidAt         DateTime?
  failureReason  String?

  organization Organization @relation(fields: [organizationId], references: [id])
}

enum PayoutStatus {
  PENDING
  PAID
  FAILED
}

// ─────────────────────────────────────────
// DOMAINES CUSTOM
// ─────────────────────────────────────────

model CustomDomain {
  id             String      @id @default(cuid())
  organizationId String
  domain         String      @unique
  scope          DomainScope @default(ORGANIZATION)
  eventId        String?
  status         DomainStatus @default(PENDING)
  sslStatus      SslStatus    @default(PENDING)
  verifiedAt     DateTime?
  lastCheckedAt  DateTime?
  createdAt      DateTime    @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  event        Event?       @relation(fields: [eventId], references: [id])
}

enum DomainScope {
  ORGANIZATION
  EVENT
}

enum DomainStatus {
  PENDING
  ACTIVE
  ERROR
}

enum SslStatus {
  PENDING
  ACTIVE
  ERROR
}

// ─────────────────────────────────────────
// SCANNER CHECK-IN
// ─────────────────────────────────────────

model ScannerLink {
  id         String    @id @default(cuid())
  eventId    String
  token      String    @unique @default(cuid())
  label      String    // nom du bénévole
  expiresAt  DateTime
  revokedAt  DateTime?
  lastUsedAt DateTime?
  createdBy  String    // userId de l'organisateur

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

// ─────────────────────────────────────────
// EMAIL MARKETING
// ─────────────────────────────────────────

model EmailTemplate {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  content        Json     // structure des blocs éditeur
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

model EmailAutomation {
  id         String          @id @default(cuid())
  eventId    String
  type       AutomationType
  enabled    Boolean         @default(true)
  content    Json            // structure des blocs éditeur
  lastSentAt DateTime?

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

enum AutomationType {
  REMINDER_J7
  REMINDER_J1
  REMINDER_J0
  POST_EVENT
  LAST_TICKETS
}

model EmailCampaign {
  id             String         @id @default(cuid())
  eventId        String
  organizationId String
  subject        String
  content        Json           // structure des blocs éditeur
  segment        Json           // {type: "all"|"by_ticket"|"by_checkin"|"custom", filters: {}}
  status         CampaignStatus @default(DRAFT)
  scheduledAt    DateTime?
  sentAt         DateTime?
  recipientCount Int?

  // Stats (remplies par Resend webhooks)
  openCount        Int @default(0)
  clickCount       Int @default(0)
  unsubscribeCount Int @default(0)
  bounceCount      Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  SENDING
  SENT
  CANCELLED
}

model EmailUnsubscribe {
  id             String   @id @default(cuid())
  email          String
  organizationId String?  // null = désinscription globale Evenly
  eventId        String?  // null = désinscription globale organisateur
  createdAt      DateTime @default(now())

  organization Organization? @relation(fields: [organizationId], references: [id])

  @@unique([email, organizationId, eventId])
}
```

---

## 6. Segment 1 — Auth & Onboarding

### User stories

```
US-AUTH-01 : En tant que visiteur, je peux m'inscrire avec email + mot de passe.
US-AUTH-02 : En tant que visiteur, je peux m'inscrire via Google OAuth.
US-AUTH-03 : En tant que visiteur, je peux m'inscrire via Apple OAuth.
US-AUTH-04 : En tant que nouvel utilisateur (email/password), je dois vérifier mon email avant d'accéder au dashboard.
US-AUTH-05 : En tant qu'utilisateur, je peux me connecter avec mes identifiants.
US-AUTH-06 : En tant qu'utilisateur, je peux réinitialiser mon mot de passe via un lien envoyé par email.
US-AUTH-07 : En tant que nouvel utilisateur (première connexion), je suis guidé par un onboarding en 3 étapes.
US-AUTH-08 : En tant que nouvel utilisateur, mon organisation est créée automatiquement avec mon rôle Admin.
US-AUTH-09 : En tant qu'utilisateur, je peux appartenir à plusieurs organisations et switcher entre elles.
US-AUTH-10 : En tant qu'Admin, je peux inviter des membres par email avec un rôle défini.
US-AUTH-11 : En tant qu'invité, je reçois un email d'invitation avec un lien valable 48h.
US-AUTH-12 : En tant qu'Admin, je ne peux pas me retirer de l'organisation si je suis le seul Admin.
```

### Pages & routes

```
/login
/register
/verify-email?token=...
/forgot-password
/reset-password?token=...
/onboarding/profile       → étape 1 : nom + slug org
/onboarding/activity      → étape 2 : type d'activité
/onboarding/stripe        → étape 3 : Stripe Connect (skippable)
```

### Onboarding — flow détaillé

**Étape 1 — Profil organisation**
- Champ : Nom de l'organisation (obligatoire)
- Champ : Slug (auto-généré depuis le nom, modifiable, vérification dispo temps réel)
- Le slug devient le sous-domaine par défaut : `[slug].evenly.com`

**Étape 2 — Type d'activité**
- Radio : Particulier / Association / Entreprise
- Stocké dans `Organization.type`

**Étape 3 — Stripe Connect**
- Bouton "Connecter mon compte bancaire" → flow Stripe Express
- Bouton "Passer cette étape" → accès au dashboard (Stripe requis uniquement pour tickets payants)
- Si skippé : banner de rappel dans le dashboard

### Système de rôles

**Rôles système (non modifiables, non supprimables)**
- `Admin` : toutes les permissions
- `Member` : CHECKIN_SCAN, TICKETS_VIEW, EVENTS_VIEW (pas de finances, pas de billing)

**Rôles custom**
- Créés par un Admin
- Permissions granulaires sélectionnables via checkboxes
- Liste des permissions disponibles : voir enum `Permission` dans le schéma DB

### Règles métier

- Un compte Google/Apple ne nécessite pas de vérification d'email
- Le lien de vérification email expire après 24h
- Le lien de réinitialisation de mot de passe expire après 1h
- Une organisation doit toujours avoir au moins 1 Admin
- Un Admin ne peut pas se retirer s'il est le seul Admin (doit d'abord promouvoir quelqu'un)
- L'invitation expire après 48h
- Si l'invité n'a pas de compte : inscription puis acceptation automatique
- Si l'invité a déjà un compte : page d'acceptation
- La session mémorise la dernière organisation active (`Session.lastOrganizationId`)
- Les permissions sont vérifiées côté serveur sur chaque Server Action

---

## 7. Segment 2 — Plan & Billing

### User stories

```
US-BILL-01 : En tant qu'organisateur Free, je peux voir mon plan actuel et le quota utilisé ce mois.
US-BILL-02 : En tant qu'organisateur Free, je peux passer au plan Pro via Stripe Checkout.
US-BILL-03 : En tant qu'organisateur Pro, je peux gérer mon abonnement (annuler, changer CB) depuis le dashboard.
US-BILL-04 : En tant qu'organisateur Pro, je reçois une facture PDF par email à chaque prélèvement.
US-BILL-05 : En tant qu'organisateur Pro, je peux consulter l'historique de mes factures dans le dashboard.
US-BILL-06 : En tant qu'organisateur Pro, ma commission passe à 2.5% et mon quota à 150 tickets/mois.
US-BILL-07 : En tant qu'organisateur avec paiement échoué, je reçois un email d'alerte quotidien pendant 7 jours.
US-BILL-08 : En tant qu'organisateur avec 7 jours d'impayés, je suis automatiquement downgradé en Free.
```

### Page Billing dans le dashboard

**Informations affichées**
- Badge plan actuel (Free / Pro + statut : Actif / Essai / Impayé)
- Date de prochain renouvellement ou fin d'essai
- Barre de progression du quota : `X / 30 (ou 150) tickets payants offerts ce mois`
- Historique des factures : date, montant, statut, lien téléchargement PDF

**Actions disponibles**
- Free : bouton "Passer Pro" → Stripe Checkout (CB, PayPal, Apple/Google Pay)
- Pro : bouton "Modifier mon moyen de paiement"
- Pro : bouton "Annuler mon abonnement" (downgrade à fin de période)

### Webhooks Stripe à gérer

```
checkout.session.completed        → Activation abonnement Pro / début essai
invoice.payment_succeeded         → Renouvellement confirmé, reset quota
invoice.payment_failed            → Tentative échouée, email alerte (max 7)
customer.subscription.deleted     → Downgrade Free
customer.subscription.updated     → Mise à jour statut
```

### Règles métier

- Essai 14 jours avec CB requise → prélèvement automatique à J+14
- Annulation → downgrade à la fin de période en cours (pas de remboursement prorata)
- Échec paiement → 7 tentatives quotidiennes puis downgrade Free automatique
- Quota commission reset automatique chaque 1er du mois (cron job)
- Changement mensuel → annuel : crédit prorata appliqué par Stripe
- Org downgradée Free : domaines custom désactivés (pas supprimés), features Pro verrouillées

---

## 8. Segment 3 — Dashboard organisateur

### User stories

```
US-DASH-01 : En tant qu'organisateur, je vois les KPIs des 30 derniers jours sur ma page d'accueil.
US-DASH-02 : En tant qu'organisateur, je vois un graphique de mes ventes par jour sur 30 jours.
US-DASH-03 : En tant qu'organisateur, je reçois des notifications in-app pour les actions importantes.
US-DASH-04 : En tant qu'organisateur, je peux switcher entre mes organisations depuis la sidebar.
US-DASH-05 : En tant qu'Admin, je peux gérer les membres et leurs rôles.
US-DASH-06 : En tant qu'Admin, je peux créer des rôles custom avec des permissions granulaires.
US-DASH-07 : En tant qu'Admin, je peux modifier les settings de l'organisation (nom, logo, slug, etc.).
US-DASH-08 : En tant qu'Admin Pro, je peux configurer mes sous-domaines et domaines custom.
US-DASH-09 : En tant que Member, je ne vois pas les sections Billing, Settings, Domaines.
```

### Navigation (sidebar fixe gauche)

```
[Switcher Organisation]    ← toujours visible en haut
────────────────────────
🏠 Accueil
🎟️ Événements
────────────────────────
👥 Membres & rôles        (permission: MEMBERS_INVITE ou MEMBERS_MANAGE_ROLES)
⚙️ Paramètres             (permission: SETTINGS_EDIT)
🌐 Domaines               (permission: SETTINGS_EDIT + plan Pro)
💳 Billing                (permission: BILLING_MANAGE)
────────────────────────
[Avatar + Déconnexion]    ← en bas
```

### Page Accueil — KPIs

**KPIs (30 derniers jours glissants)**
- Revenus nets (après commission Evenly)
- Tickets vendus
- Événements actifs
- Taux de check-in moyen
- Variation vs 30 jours précédents (ex: +12%, -3%)

**Graphique principal**
- Courbe ventes par jour sur 30 jours
- Toggle axe Y : revenus € / nombre tickets
- Tooltip hover : détail jour
- Multi-courbes si plusieurs événements actifs

**Activité récente**
- Feed chronologique : achats, check-ins, remboursements
- 20 dernières entrées + lien "voir tout"

**Notifications**
- Cloche dans le header, badge rouge avec compteur
- Types : nouvel achat, remboursement demandé, membre accepté, échec paiement, quota 80%/100%

### Page Membres & rôles

**Onglet Membres**
- Liste : avatar, nom, email, rôle, date ajout, actions (changer rôle, retirer)
- Bouton "Inviter" → modal : email + sélection rôle
- Invitations en attente : email, rôle, expiration, renvoyer/annuler

**Onglet Rôles**
- Rôles système : lecture seule
- Rôles custom : créer / éditer / supprimer (bloqué si membres actifs sur ce rôle)

### Page Paramètres

- Nom organisation, slug (vérif dispo temps réel), logo (upload + crop carré), description, email, timezone
- Bouton "Supprimer l'organisation" (rouge, 2 confirmations, bloqué si événements actifs ou abonnement Pro actif)

### Page Domaines (Pro uniquement)

- Verrouillée avec banner upgrade si Free
- **Sous-domaine org** : `[input].evenly.com` — vérif dispo temps réel
- **Sous-domaine événement** : configurable depuis la page de l'événement
- **Domaine custom** : champ + instructions CNAME copiables + statut DNS (✅/⏳/❌) + tutoriel contextuel par registrar (OVH, Cloudflare, Namecheap, Gandi)
- Vérification DNS automatique toutes les 10 min si PENDING
- Bouton "Vérifier maintenant" disponible à tout moment

### Règles métier

- KPIs et graphiques scopés à l'organisation active uniquement
- Événements DRAFT exclus des stats revenus
- Slug modifié → ancien slug redirige en 301 pendant 6 mois
- Member ne voit pas Billing, Settings, Domaines (vérification serveur)
- Switcher n'affiche que les organisations dont l'utilisateur est membre

---

## 9. Segment 4 — Création & gestion d'événements

### User stories

```
US-EVENT-01 : En tant qu'organisateur, je peux créer un événement en moins de 60 secondes (wizard 3 étapes).
US-EVENT-02 : En tant qu'organisateur, mon brouillon est sauvegardé automatiquement en temps réel.
US-EVENT-03 : En tant qu'organisateur, je peux ajouter plusieurs types de tickets à mon événement.
US-EVENT-04 : En tant qu'organisateur, je peux choisir entre placement libre et placement assigné.
US-EVENT-05 : En tant qu'organisateur (placement assigné), je peux configurer un plan de salle avec rangs et sièges par catégorie.
US-EVENT-06 : En tant qu'organisateur (placement assigné), je peux choisir si les acheteurs peuvent sélectionner leur siège.
US-EVENT-07 : En tant qu'organisateur, je peux créer des codes promo (%, montant fixe, gratuit).
US-EVENT-08 : En tant qu'organisateur, je peux consulter les commandes de mon événement.
US-EVENT-09 : En tant qu'organisateur, je peux approuver ou refuser les demandes de remboursement.
US-EVENT-10 : En tant qu'organisateur, je peux annuler un événement (remboursements automatiques).
US-EVENT-11 : En tant qu'organisateur, je peux dupliquer un événement existant.
US-EVENT-12 : En tant qu'organisateur, je peux définir ma politique de remboursement par événement.
US-EVENT-13 : En tant qu'organisateur, je peux ajouter des champs custom aux formulaires d'achat.
US-EVENT-14 : En tant qu'organisateur, je peux marquer un type de ticket comme nominatif.
US-EVENT-15 : En tant qu'organisateur, je peux gérer les emails automatiques de mon événement (activer/désactiver individuellement).
```

### Wizard de création (3 étapes)

**Étape 1 — Infos de base**
- Titre (obligatoire)
- Description (rich text basique : gras, italique, liens, listes)
- Bannière (upload optionnel)
- Date début + heure (obligatoire)
- Date fin + heure (optionnel)
- Timezone (pré-rempli depuis settings org)

**Étape 2 — Lieu**
- Type : Physique / En ligne / Hybride
- Physique : adresse (autocomplétion Google Places) + coordonnées GPS auto
- En ligne : URL stream (visible uniquement après achat)
- Hybride : les deux

**Étape 3 — Récapitulatif**
- Preview de la page publique
- Actions : "Sauvegarder brouillon" ou "Publier"
- Publication bloquée si aucun ticket → message + CTA "Ajoutez un ticket"
- Publication bloquée pour tickets payants si Stripe non connecté

**Autosave**
- Debounce 1s, indicateur "Sauvegardé ✓" / "Sauvegarde en cours..."
- Reprend à l'étape en cours si fermeture accidentelle

### Page de gestion d'événement — onglets

**[Aperçu]**
- Résumé : titre, dates, lieu, statut (badge coloré)
- KPIs propres à l'événement : tickets vendus, revenus, taux remplissage, taux check-in
- Courbe de ventes dans le temps
- Lien public + bouton copier + bouton partager
- Actions : Publier / Dépublier / Annuler / Dupliquer

**[Tickets]**
- Liste des types de tickets : nom, prix, vendu/total, statut
- Bouton "Ajouter un ticket" → drawer
- Drag & drop pour l'ordre d'affichage
- Actions par ticket : modifier, masquer, supprimer (bloqué si ventes → masquer)
- **Type de placement** : sélecteur global sur l'événement (Libre / Assigné)

**Drawer création/édition de ticket**
- Nom, prix (0€ = gratuit), quantité (vide = illimité)
- Dates début/fin de vente (optionnelles)
- Min/max par commande
- Description
- Nominatif (checkbox) → active formulaire par ticket
- Champs custom : ajout de champs (texte, textarea, select, checkbox, number) avec label + obligatoire/optionnel
- Si SeatingType = ASSIGNED : sélection de la catégorie de salle associée

**[Plan de salle]** (si SeatingType = ASSIGNED)

*Configuration par l'organisateur :*
- Interface visuelle pour créer des catégories (nom + couleur)
- Ajout de rangs par catégorie (nom du rang, ex: "A", "B", "1")
- Ajout de sièges par rang (nombre + labels auto-générés ou manuels)
- Drag & drop pour repositionner les rangs/catégories
- Blocage de sièges spécifiques (inaccessibles, réservés staff)
- Toggle : "Les acheteurs peuvent choisir leur siège" (oui/non)

*Règles du plan de salle :*
- Les sièges vendus sont verrouillés, non modifiables
- Un rang ne peut être supprimé que si aucun siège n'est vendu
- La modification du plan pendant la vente envoie une notification aux acheteurs avec siège assigné

**[Codes promo]**
- Liste des codes : code, type, valeur, utilisations, expiration, statut
- Bouton "Créer un code" → drawer
- Drawer : code (custom ou généré aléatoirement), type (%, montant fixe, gratuit), valeur, tickets concernés, limite totale, limite/email, date expiration
- Actions : désactiver / supprimer (bloqué si utilisé → désactivation uniquement)

**[Commandes]**
- Liste : acheteur, tickets, montant, date, statut
- Recherche par email ou nom
- Détail commande : tickets individuels + QR codes + statut check-in
- Action remboursement : approuver/refuser les demandes en attente
- Demande hors délai : affichée avec badge "Hors délai" — organisateur peut quand même approuver

**[Check-in]**
- Stats temps réel : X/Y présents, taux %
- Liste des derniers check-ins
- Gestion des liens bénévoles (voir Segment 7)
- Lien vers app scanner

**[Emails]**
- Gestion des automatisations : liste des 5 types avec toggle on/off et éditeur de contenu
- Accès aux campagnes manuelles (voir Segment 8)
- Historique des envois

**[Paramètres]**
- Modification : titre, description, dates, lieu
- Politique de remboursement : Non remboursable / X jours avant / Toujours remboursable
- Visibilité : Public / Non listé
- Message de confirmation post-achat
- Personnalisation visuelle (Pro) : couleur principale, couleur accent
- Annulation de l'événement : confirmation 2 étapes + remboursements automatiques

### Règles métier

- DRAFT : non indexé, non accessible publiquement (retourne 404)
- PUBLISHED sans tickets dispo → affiche "Complet" sur la page publique
- Modification des dates d'un événement publié → notification email aux acheteurs
- Annulation → remboursements Stripe auto + email à tous les acheteurs
- Prix ticket figé après première vente (le montant ne peut plus être modifié)
- Ticket masqué → invisible publiquement, billets déjà achetés restent valides
- Deux membres modifient simultanément → last write wins + notification "Modifié par [nom]"
- Remboursement partiel → seuls les tickets sélectionnés sont invalidés

---

## 10. Segment 5 — Page événement publique & billetterie

### User stories

```
US-PUBLIC-01 : En tant qu'acheteur, je vois toutes les infos d'un événement sur une seule page.
US-PUBLIC-02 : En tant qu'acheteur, je peux sélectionner mes tickets et payer sans quitter la page.
US-PUBLIC-03 : En tant qu'acheteur, je n'ai pas besoin de créer un compte pour acheter.
US-PUBLIC-04 : En tant qu'acheteur, je peux créer un compte optionnellement lors du paiement.
US-PUBLIC-05 : En tant qu'acheteur (ticket nominatif), je remplis un formulaire par ticket.
US-PUBLIC-06 : En tant qu'acheteur (ticket nominatif, premier ticket), je peux auto-remplir avec mes coordonnées.
US-PUBLIC-07 : En tant qu'acheteur (placement assigné, choix activé), je peux choisir mon siège sur le plan.
US-PUBLIC-08 : En tant qu'acheteur (placement assigné, choix activé), un siège m'est auto-assigné par défaut avec option "Choisir ma place".
US-PUBLIC-09 : En tant qu'acheteur, je reçois mes billets par email (PDF) et via un lien magique.
US-PUBLIC-10 : En tant qu'acheteur, je peux ajouter mes billets à Apple Wallet / Google Wallet.
US-PUBLIC-11 : En tant qu'acheteur avec un compte, je retrouve mes commandes passées via mon email.
US-PUBLIC-12 : En tant qu'acheteur, je vois la commission Evenly affichée clairement avant de payer.
```

### Structure de la page publique (single page, scroll)

```
Navbar (logo orga ou Evenly si Free)
  ↓
Bannière pleine largeur + overlay titre + dates
  ↓
[Layout 2 colonnes sur desktop, 1 colonne sur mobile]

Colonne gauche :              Colonne droite (sticky) :
- Infos clés (date, lieu)    - Bloc achat
- Description                  → Liste tickets + stock
- Carte Google Maps            → Sélecteur quantités
- Compte à rebours             → Champ code promo
- FAQ accordéon                → Récapitulatif + frais
- Autres events de l'orga      → CTA "Continuer"
- Partage social
  ↓
Footer minimal
```

Sur mobile : colonne droite (bloc achat) passe en haut. Bouton CTA fixe en bas "Voir les billets" → scroll vers le bloc achat.

### Bloc achat

- Stock visible par type de ticket : "X restants" (ou "Complet" si épuisé)
- Sélecteur de quantité par type (+ / −), min/max respectés
- Si SeatingType = ASSIGNED et allowSeatChoice = true :
  - Bouton "Choisir ma place" → ouvre le plan de salle interactif
  - Si l'acheteur ne clique pas → siège auto-assigné par Evenly au paiement
- Code promo : saisie + validation temps réel (debounce 500ms)
- Récapitulatif : sous-total, réduction promo, commission Evenly (avec tooltip explicatif), total
- CTA "Continuer" → affiche le formulaire checkout inline (sans redirect)
- Réservation temporaire du stock : 10 minutes, libéré si abandon

### Formulaire checkout (inline)

**Bloc payeur (toujours présent)**
- Prénom, Nom, Email, Téléphone

**Bloc tickets nominatifs** (si `TicketType.isNominative = true`)
- Formulaire par ticket : Prénom, Nom, Email, Téléphone + champs custom
- Premier ticket : checkbox "Utiliser mes coordonnées" → autofill depuis bloc payeur
- Tickets suivants : à remplir manuellement

**Création de compte optionnelle**
- Checkbox non cochée par défaut : "Sauvegarder mes billets (créer un compte)"
- Si cochée : champ mot de passe
- Si email déjà existant : "Vous avez déjà un compte — connectez-vous pour rattacher cette commande"

**Bloc paiement (Stripe Elements)**
- Carte bancaire (numéro, expiration, CVC)
- Apple Pay / Google Pay (si disponible sur l'appareil — détection auto)
- Si code promo FREE (100%) : pas de formulaire de paiement affiché
- Icône cadenas + "Paiement sécurisé par Stripe"
- Commission Evenly rappelée juste au-dessus du bouton de paiement

### Post-achat

**Page de confirmation**
- Résumé commande : événement, date, lieu, tickets, total
- Bouton "Télécharger mes billets (PDF)"
- Bouton "Ajouter au wallet" (Apple / Google)
- Lien magique : "Retrouvez vos billets → evenly.com/tickets/[magicToken]"
- Partage social : Twitter/X, Facebook, WhatsApp

**Email de confirmation**
- Envoyé immédiatement après paiement
- PDF attaché (un par ticket si nominatif, groupé sinon)
- Lien magique inclus
- Design Evenly en Free, design organisateur en Pro

**PDF du billet**
- QR code unique et grand format
- Nom événement, date, lieu, type de ticket
- Nom du titulaire (si nominatif)
- Numéro de commande
- Numéro de siège (si placement assigné)
- Logo Evenly en Free, logo organisateur en Pro

**Lien magique** (`evenly.com/tickets/[magicToken]`)
- Accessible sans compte
- Affiche tous les tickets de la commande avec QR codes
- Bouton re-télécharger PDF + ajouter au wallet
- Si compte créé : rattaché au compte, accessible depuis le dashboard acheteur

**Apple Wallet / Google Wallet**
- Un pass par ticket
- QR code intégré
- Mise à jour automatique si infos événement changent
- Notification push si annulation

### Éléments supplémentaires sur la page

- **Carte Google Maps** : événements physiques/hybrides, pin + lien "Itinéraire"
- **Compte à rebours** : affiché si événement dans ≤ 30 jours (JJ:HH:MM:SS, temps réel)
- **Autres événements de l'organisateur** : max 3 événements à venir, cards cliquables
- **FAQ** : accordéon, max 10 Q/R, configurée par l'organisateur, masquée si vide
- **Partage social** : Twitter/X, Facebook, WhatsApp, copier lien (Open Graph configuré)

### Règles métier

- Page rendue en SSR pour le SEO
- DRAFT → 404
- CANCELLED → page dédiée "Événement annulé" avec infos remboursement
- Stock décrémenté à la création de la commande (pas au paiement) — réservation 10 min
- Deux utilisateurs ne peuvent pas réserver le même siège simultanément (lock optimiste 10 min)
- Code promo FREE bypass complètement Stripe
- Paiement échoué → message inline, stock libéré, formulaire reste rempli
- Session expirée (10 min) → "Votre réservation a expiré, veuillez recommencer"

---

## 11. Segment 6 — Paiement & Stripe Connect

### User stories

```
US-PAY-01 : En tant qu'organisateur, je peux connecter mon compte bancaire via Stripe Express.
US-PAY-02 : En tant qu'organisateur, je vois mon solde disponible et mon solde en réserve dans le dashboard.
US-PAY-03 : En tant qu'organisateur, je peux demander un virement manuel de mon solde disponible.
US-PAY-04 : En tant qu'organisateur, je vois l'historique de mes virements et leur statut.
US-PAY-05 : En tant qu'organisateur, 20% de chaque paiement est retenu en réserve pendant 30 jours.
US-PAY-06 : En tant qu'acheteur, je suis remboursé automatiquement si l'organisateur annule l'événement.
US-PAY-07 : En tant qu'acheteur, je peux demander un remboursement si la politique le permet.
US-PAY-08 : En tant qu'organisateur, je vois les demandes de remboursement en attente et je les approuve/refuse.
US-PAY-09 : En tant qu'organisateur, je garde toujours mon solde net (commission Evenly déjà déduite à la source).
```

### Flux de paiement

```
1. Acheteur valide le checkout
2. Evenly crée Order (PENDING) + réservation stock/siège 10 min
3. Evenly crée PaymentIntent Stripe :
   - amount = total commande
   - application_fee_amount = commission Evenly
   - transfer_data.destination = stripeAccountId organisateur
4. Stripe Elements confirme le paiement
5. Webhook payment_intent.succeeded →
   - Order → COMPLETED
   - Tickets créés avec QR codes
   - Stock définitivement décrémenté
   - Quota organisateur incrémenté
   - Réserve créée (20%, libérée dans 30 jours)
   - Email de confirmation envoyé
```

### Réserve (20% / 30 jours / tous les organisateurs)

- 20% de chaque paiement retenu pendant 30 jours
- Appliqué à tous les organisateurs sans exception
- Géré côté Evenly en DB (pas une feature native Stripe Express)
- Cron job quotidien : libère les réserves arrivées à `releasesAt` → incrémente `availableBalanceCents`
- Dashboard organisateur : solde disponible / solde en réserve / prochaine libération

### Virements manuels

- Bouton "Demander un virement" (si `availableBalanceCents` > 0)
- Montant : champ pré-rempli avec le solde total, modifiable (min 1€, max solde dispo)
- Confirmation 2 clics
- Evenly déclenche un `Transfer` Stripe vers le compte Express
- Délai : 1-2 jours ouvrés
- Statuts : PENDING → PAID ou FAILED
- Échec : notification in-app + email, solde récrédité

### Politique de remboursement

**Configurée par l'organisateur par événement :**
- Non remboursable
- Remboursable jusqu'à X jours avant l'événement
- Toujours remboursable

**Process :**
1. Acheteur : demande depuis le lien magique ou son compte → sélection des tickets
2. Dashboard organisateur : demande visible avec statut EN_ATTENTE
3. Organisateur approuve ou refuse (message optionnel)
4. Si approuvé → remboursement Stripe → tickets invalidés immédiatement
5. Email de confirmation à l'acheteur (délai estimé 5-10 jours ouvrés)

**Commission Evenly sur les remboursements**
- Evenly garde sa commission dans tous les cas
- Stripe ne rembourse pas ses frais de traitement (standard industrie)
- Mentionné clairement dans les CGU et sur la page publique de chaque événement

**Annulation d'événement**
- Remboursement automatique de toutes les commandes non remboursées
- Pas de validation manuelle
- Email automatique à tous les acheteurs

### Statuts du compte Stripe Express

```
NOT_CONNECTED   → Aucun compte créé
PENDING         → Onboarding en cours
ACTIVE          → Vérifié, peut recevoir des paiements
RESTRICTED      → Problème détecté par Stripe, action requise
RESTRICTED_SOON → Documents à renouveler prochainement
```

### Webhooks Stripe

```
payment_intent.succeeded     → Compléter la commande, créer les tickets
payment_intent.payment_failed → Order → FAILED, libérer le stock/siège
account.updated              → Mettre à jour StripeAccountStatus
transfer.paid                → Payout → PAID
transfer.failed              → Payout → FAILED, notifier organisateur
charge.refunded              → Confirmer le remboursement côté Evenly
```

---

## 12. Segment 7 — QR Check-in scanner

### User stories

```
US-SCAN-01 : En tant qu'organisateur, je peux générer des liens temporaires pour mes bénévoles.
US-SCAN-02 : En tant que bénévole, je peux scanner des QR codes depuis mon téléphone sans compte Evenly.
US-SCAN-03 : En tant que scanneur, je reçois un feedback immédiat visuel + sonore + haptique après chaque scan.
US-SCAN-04 : En tant que scanneur, je peux saisir manuellement un numéro de billet si le QR est illisible.
US-SCAN-05 : En tant que scanneur, je peux rechercher un participant par nom ou email.
US-SCAN-06 : En tant que scanneur, je peux voir et cocher manuellement la liste des participants.
US-SCAN-07 : En tant que scanneur, je vois les stats temps réel (présents, taux, répartition par ticket).
US-SCAN-08 : En tant qu'organisateur, je peux révoquer un lien bénévole à tout moment.
```

### Format
**PWA** sur `scanner.evenly.com`. Installable sur l'écran d'accueil. Migration native post-MVP.

### Accès — 2 modes

**Mode 1 — Lien bénévole**
- Généré par l'organisateur depuis l'onglet Check-in de l'événement
- Formulaire : nom du bénévole + durée (jour J / 24h / 48h / custom)
- Accès sans compte Evenly
- Événement pré-sélectionné (celui sur lequel le lien a été généré)
- Révocable à tout moment

**Mode 2 — Membre avec permission `CHECKIN_SCAN`**
- Login classique Evenly
- Sélection de l'événement :
  - 1 seul événement actif aujourd'hui → sélection automatique
  - Plusieurs → écran de sélection
  - Aucun → message "Aucun événement aujourd'hui"
- Peut switcher d'événement sans se reconnecter

### Interface scanner

```
[Header compact : nom event + bouton Stats]
[Viewfinder caméra — plein écran]
[Champ saisie manuelle — toujours visible]
[Tabs : Recherche | Liste]
```

### Feedback par résultat de scan

| Résultat | Visuel | Son | Haptic |
|---|---|---|---|
| ✅ Valide | Flash vert + nom + type ticket | Bip aigu court | Vibration courte |
| ❌ Déjà scanné | Flash orange + "Déjà scanné à HH:MM" | Bip grave double | Vibration longue |
| ❌ Invalide | Flash rouge + "Billet invalide" | Bip grave | Vibration longue |
| ❌ Mauvais event | Flash rouge + "Billet pour un autre événement" | Bip grave | Vibration longue |

Retour automatique au scan après 1.5s.

### Stats (panneau rétractable)

- Présents : X / Y total
- Taux de remplissage : barre de progression + %
- Répartition par type de ticket
- Historique des 20 derniers scans
- Mise à jour toutes les 5s (polling) ou WebSocket

### Règles métier

- Un billet déjà scanné ne peut pas être re-validé
- Lien expiré/révoqué → page d'erreur claire
- Permission `CHECKIN_SCAN` → accès scanner uniquement, pas au dashboard complet
- Bénévole via lien ne voit pas les infos financières
- Check-in via liste/recherche → confirmation requise
- `Ticket.checkedInBy` stocke le userId ou le ScannerLink.id
- Les logs de check-in sont immuables (pas de "dé-scanner")

---

## 13. Segment 8 — Email marketing

### User stories

```
US-EMAIL-01 : En tant qu'organisateur Pro, je peux créer et envoyer des campagnes email à mes acheteurs.
US-EMAIL-02 : En tant qu'organisateur Pro, je peux programmer une campagne à une date/heure précise.
US-EMAIL-03 : En tant qu'organisateur Pro, je peux activer/désactiver chaque automatisation indépendamment.
US-EMAIL-04 : En tant qu'organisateur Pro, je peux personnaliser le contenu de chaque automatisation.
US-EMAIL-05 : En tant qu'organisateur Pro, je peux segmenter mes destinataires (tous, par type ticket, par check-in).
US-EMAIL-06 : En tant qu'organisateur Pro, je consulte les stats de chaque campagne (ouvertures, clics, désinscriptions).
US-EMAIL-07 : En tant qu'acheteur, je peux me désinscrire des emails d'un événement ou de tous les emails d'un organisateur.
US-EMAIL-08 : En tant qu'organisateur, les emails transactionnels (confirmation, remboursement) sont envoyés en Free et Pro.
```

### Fonctionnalité Pro uniquement
Les campagnes manuelles et automatisations marketing sont réservées au plan Pro. Les emails transactionnels (confirmation d'achat, remboursement, annulation) sont disponibles en Free et Pro.

### Éditeur visuel (drag & drop par blocs)

**Blocs disponibles**
- Texte (rich text : gras, italique, liens, listes, alignement)
- Image (upload ou URL, alt text, lien cliquable, taille)
- Bouton CTA (texte, URL, couleur, alignement)
- Séparateur (couleur, hauteur)
- Infos événement (auto-rempli : nom, date, heure, lieu, bannière)
- Réseaux sociaux (icônes cliquables : FB, Instagram, Twitter/X, LinkedIn, TikTok)

**Fonctionnalités**
- Preview desktop/mobile toggle
- Envoi email de test à soi-même
- Couleurs globales pré-remplies depuis les couleurs de l'organisation Pro
- Footer automatique obligatoire : nom org + liens désinscription
- Sauvegarde automatique du brouillon
- Templates pré-construits : Reminder, Derniers billets, Remerciement post-event, Annonce nouvel événement, Vierge
- Sauvegarde de templates personnalisés réutilisables

### Automatisations par événement

Configurables depuis l'onglet Emails de la page de gestion d'événement. Chaque automatisation a son propre toggle on/off.

| Automatisation | Déclencheur | Destinataires | Par défaut |
|---|---|---|---|
| Reminder J-7 | J-7 avant event à 10h | Acheteurs non remboursés | ✅ Activé |
| Reminder J-1 | J-1 avant event à 10h | Acheteurs non remboursés | ✅ Activé |
| Reminder J-0 | Matin de l'event à 8h | Acheteurs non remboursés | ✅ Activé |
| Post-event | 2h après la fin de l'event | Tous les acheteurs | ❌ Désactivé |
| Derniers billets | Stock global < 10% | Liste manuelle de contacts | ❌ Désactivé |

### Campagnes manuelles

**Création**
1. Sélectionner l'événement
2. Définir le segment de destinataires
3. Rédiger dans l'éditeur visuel
4. Choisir : envoi immédiat ou programmé (date + heure)
5. Preview + email de test
6. Confirmation : nombre de destinataires estimé affiché

**Segmentation**
- Tous les acheteurs de l'événement
- Par type de ticket (sélection multiple)
- Par statut check-in : présents / absents
- Segment custom : combinaison de filtres

**Programmation**
- Modification possible jusqu'à 30 min avant l'envoi
- Annulation possible jusqu'à 5 min avant
- Statuts : DRAFT / SCHEDULED / SENDING / SENT / CANCELLED

### Stats par campagne

- Taux d'ouverture
- Taux de clic
- Désinscriptions
- Bounces (soft + hard)
- Envoyés / Délivrés / Échoués

### Désinscriptions

- **Par événement** : "Se désinscrire des emails de cet événement" dans le footer
- **Globale organisateur** : "Ne plus recevoir d'emails de [nom org]" dans le footer
- Emails transactionnels ignorent les préférences de désinscription marketing (toujours envoyés)
- Hard bounce → blacklist automatique email pour cet organisateur

### Règles métier

- Zéro destinataire → erreur bloquante avant envoi
- Campagne SENT → non modifiable, non renvoyable (créer une nouvelle)
- Automatisations non déclenchées si événement annulé
- J-7/J-1/J-0 ignorés si l'événement a déjà commencé au moment du déclenchement
- Campagne programmée sur événement annulé → annulation automatique + notification organisateur
- Grands volumes (10 000+) → envoi par batch via Resend

---

## 14. Segment 9 — Sous-domaines & domaines custom

### User stories

```
US-DOM-01 : En tant qu'organisateur (Free + Pro), mon organisation a un sous-domaine Evenly (slug.evenly.com).
US-DOM-02 : En tant qu'organisateur Pro, je peux créer un sous-domaine dédié pour un événement.
US-DOM-03 : En tant qu'organisateur Pro, je peux connecter un domaine custom (ex: tickets.monsite.com).
US-DOM-04 : En tant qu'organisateur Pro, je peux connecter plusieurs domaines custom.
US-DOM-05 : En tant qu'organisateur, si je change mon sous-domaine, les anciens liens redirigent 301 pendant 6 mois.
US-DOM-06 : En tant qu'organisateur Pro, le domaine custom bénéficie d'un certificat SSL automatique (Let's Encrypt).
US-DOM-07 : En tant qu'organisateur Pro, je vois le statut DNS et SSL de mon domaine custom en temps réel.
US-DOM-08 : En tant qu'organisateur Pro, je bénéficie d'un tutoriel contextuel pour configurer mon DNS par registrar.
```

### Tableau récapitulatif

| Type | Exemple | Plan | Scope |
|---|---|---|---|
| URL par défaut | `evenly.com/o/mon-asso` | Free + Pro | Org |
| Sous-domaine org | `mon-asso.evenly.com` | Free + Pro | Org |
| Sous-domaine événement | `jazz-festival.evenly.com` | Pro | Événement |
| Domaine custom | `tickets.monsite.com` | Pro | Org ou Événement |

### Sous-domaine org

- Créé automatiquement au slug de l'org lors de l'onboarding
- Modifiable dans Settings → Domaines
- Vérification disponibilité temps réel (debounce 500ms)
- Format : `[a-z0-9-]`, min 3, max 50 caractères
- Slugs réservés bloqués : `app`, `api`, `www`, `scanner`, `admin`, `mail`, `support`, `blog`, `help`, `docs`, `status`

**Changement de sous-domaine**
- Ancien sous-domaine → redirection 301 pendant 6 mois
- Après 6 mois : libéré et réattribuable
- `Organization.previousSubdomain` + `Organization.subdomainChangedAt` stockés pour gestion de la redirection

### Domaine custom

**Configuration**
1. Saisir le domaine dans le dashboard
2. Instructions DNS affichées :
   ```
   Type  : CNAME
   Nom   : [préfixe]
   Valeur: evenly.com
   TTL   : 3600
   ```
3. Bouton "Copier" par champ
4. Bouton "Vérifier maintenant" → lookup DNS côté serveur
5. Statut : ✅ Vérifié / ⏳ En attente / ❌ Erreur

**Tutoriel contextuel (dans le dashboard uniquement)**
- Instructions visuelles par registrar : OVH, Cloudflare, Namecheap, Gandi, Google Domains
- Screenshots annotés
- Affiché à côté des instructions DNS, accordéon par registrar

**Vérification DNS**
- Lookup côté serveur (vérification que le CNAME pointe vers `evenly.com`)
- Vérification automatique toutes les 10 min si statut PENDING
- Arrêt des vérifications auto après 48h → notification organisateur
- Vérification instantanée via bouton "Vérifier maintenant"

**SSL — Let's Encrypt**
- Certificat généré automatiquement dès DNS vérifié
- Renouvellement automatique tous les 90 jours
- Échec renouvellement → notification organisateur + page erreur branded Evenly

**Scope**
- Par défaut : liste des événements de l'org
- Assignable à un événement spécifique via dropdown
- Max 10 domaines custom par org Pro (anti-abus)

**Domaine mal configuré / expiré**
- Page d'erreur branded Evenly : logo, message clair, lien vers URL par défaut de l'org

### Routing middleware

```
Requête entrante
      ↓
header: host
      ↓
evenly.com / www.evenly.com      → apps/web (landing)
app.evenly.com                   → apps/app (dashboard)
scanner.evenly.com               → apps/scanner (PWA)
*.evenly.com                     → lookup DB par Organization.subdomain ou Event.subdomain
[autre domaine]                  → lookup DB par CustomDomain.domain
                                   → 404 branded si non trouvé
```

### Org downgradée Free → Pro → Free

- Domaines custom : désactivés (pas supprimés), réactivés automatiquement si retour Pro sans reconfiguration DNS

---

## 15. Segment 10 — Landing page

### User stories

```
US-LAND-01 : En tant que visiteur, je comprends la proposition de valeur d'Evenly en moins de 5 secondes.
US-LAND-02 : En tant que visiteur, je peux simuler mes économies vs Eventbrite via un outil interactif.
US-LAND-03 : En tant que visiteur, je peux voir le pricing clairement avec un toggle mensuel/annuel.
US-LAND-04 : En tant que visiteur, je peux changer la langue (FR/EN) sans rechargement.
US-LAND-05 : En tant que visiteur, je peux créer mon compte directement depuis la landing.
```

### Structure

```
Navbar (sticky)
Hero
Testeur de frais (slider interactif)
Comparaison Eventbrite (tableau)
Fonctionnalités clés (5 features)
Pricing (Free vs Pro)
FAQ (accordéon)
Footer
```

### Navbar

- Logo Evenly (lien vers `evenly.com`)
- Liens ancres : Fonctionnalités · Tarifs · FAQ
- Switch FR/EN (changement sans reload)
- Bouton "Se connecter" (ghost) → `app.evenly.com/login`
- Bouton "Créer un compte" (primary) → `app.evenly.com/register`
- Mobile : hamburger → drawer

### Hero

**Accroche (FR)** : *"La billetterie honnête. Créez votre événement en 60 secondes."*
**Sous-titre** : *"Zéro commission sur les tickets gratuits. 5% sur les payants. Affiché clairement, toujours."*

**CTA principal** : "Créer mon premier événement" → `/register`
**CTA secondaire** : "Voir comment ça marche" → ancre features

**Éléments visuels**
- Animation : mockup dashboard / page événement (Framer Motion, stagger à l'entrée)
- Compteur animé : "X€ économisés vs Eventbrite ce mois" (hardcodé au lancement)
- Badges : "Paiement sécurisé Stripe" · "RGPD" · "Données hébergées en EU"

### Testeur de frais (slider interactif)

- Slider 1 : Nombre de tickets (1 → 5 000)
- Slider 2 : Prix unitaire du ticket (1€ → 500€)
- Affichage en temps réel :
  - Commission Eventbrite estimée
  - Commission Evenly Free
  - Commission Evenly Pro
  - Économie réalisée (€ et %)
- Intégré entre la section Hero et la comparaison Eventbrite

### Comparaison Eventbrite

Tableau sobre :

| | Evenly Free | Evenly Pro | Eventbrite |
|---|---|---|---|
| Tickets gratuits | 0% ∞ | 0% ∞ | 0% |
| Commission payants | 5% (30 offerts/mois) | 2.5% (150 offerts/mois) | ~6.6% + 1.79€/ticket |
| Abonnement | 0€ | 29€/mois | Variable |
| Branding retiré | ❌ | ✅ | ✅ (payant) |
| Domaine custom | ❌ | ✅ | ❌ |
| Email marketing | ❌ | ✅ | Limité |
| Multi-org & rôles | ✅ | ✅ | ❌ |
| Transparence frais | ✅ | ✅ | ❌ |

### Fonctionnalités clés (5 features, alternance texte/visuel)

1. **Création en 60 secondes** — wizard 3 étapes, mockup animé
2. **Tickets gratuits, vraiment gratuits** — 0% commission, compteur animé
3. **QR Check-in intégré** — PWA, liens bénévoles, mockup mobile
4. **Email marketing inclus** — éditeur visuel, automatisations, mockup éditeur (Pro)
5. **Votre domaine, votre marque** — domaine custom, page brandée, mockup page événement (Pro)

### Pricing

**Toggle mensuel / annuel** (annuel = 249€ = -15%)

**Card Free** : 0€ — fonctionnalités de base, 0% tickets gratuits, 5% payants (30 offerts)
**Card Pro** (badge "Populaire") : 29€/mois — essai 14 jours, 2.5% payants (150 offerts), toutes les features

Note de transparence : *"Evenly affiche toujours sa commission à l'organisateur et à l'acheteur. Aucune surprise."*

### FAQ (accordéon, 10 questions)

Questions clés :
- Comment fonctionne la commission ?
- Les tickets gratuits sont-ils vraiment sans commission ?
- Quand est-ce que je reçois mon argent ?
- Comment fonctionne l'essai Pro 14 jours ?
- Puis-je annuler à tout moment ?
- Comment configurer mon domaine custom ?
- Evenly est-il conforme au RGPD ?
- Quelle différence avec Eventbrite et HelloAsso ?
- Comment fonctionne le check-in QR ?
- Que se passe-t-il si j'annule un événement ?

### Footer (4 colonnes)

```
Evenly       Produit          Légal                  Support
──────       ───────          ─────                  ───────
Logo         Fonctionnalités  CGU                    Documentation
Tagline      Tarifs           Politique confidential. Contact
RS sociaux   FAQ              Mentions légales       Status page
             Changelog        Cookies
```

Réseaux sociaux : Twitter/X, LinkedIn, Instagram
Copyright : © 2025 Evenly. Fait avec ♥ en Belgique.

### Animations (Framer Motion)

- Stagger d'entrée sur le hero
- Fade + slide up au scroll (Intersection Observer) sur chaque section
- Hover states sur cards features et pricing
- Count-up sur le compteur hero
- Transition douce toggle mensuel/annuel
- `prefers-reduced-motion` respecté → animations désactivées

### SEO & Performances

- SSG (Static Site Generation) pour toutes les pages
- Meta title, description, OG image en FR et EN
- OG image dynamique (logo + tagline)
- Score Lighthouse cible : 95+ Performance, 100 SEO, 100 Accessibility
- Sitemap automatique + robots.txt

---

## 16. Ordre de développement recommandé

```
Phase 1 — Fondations
  1. Setup monorepo (Turborepo + pnpm)
  2. Package DB : schema Prisma final + migrations
  3. Package core : structure + types partagés
  4. Package UI : composants de base (Button, Input, Modal, etc.)

Phase 2 — Auth & Structure
  5. Auth (NextAuth v5 : Google, Apple, email/password)
  6. Onboarding (3 étapes)
  7. Dashboard shell (layout + sidebar + routing)

Phase 3 — Core organisateur
  8. Création & gestion d'événements (wizard + onglets)
  9. Gestion des tickets (types, placement libre)
 10. Plan de salle (placement assigné)

Phase 4 — Billetterie publique
 11. Page événement publique (SSR)
 12. Checkout (Stripe Elements + formulaires)
 13. Post-achat (confirmation, PDF, lien magique)
 14. Apple/Google Wallet

Phase 5 — Paiements & Finances
 15. Stripe Connect Express (onboarding organisateur)
 16. Virements manuels + réserve
 17. Remboursements (demande + approbation)
 18. Billing Pro (Stripe Billing + webhooks)

Phase 6 — Features avancées
 19. QR Check-in PWA (scanner)
 20. Email marketing (éditeur + campagnes + automatisations)
 21. Sous-domaines & domaines custom

Phase 7 — Go to market
 22. Landing page (evenly.com)
 23. SEO, performances, accessibilité
 24. Monitoring & alertes
```

---

*Document généré le 2025. Toute modification doit être validée et reflétée dans ce fichier.*
