# Tests restants à écrire

État au 19 octobre 2026 (commit `1cce27a`). Objectif à terme : 100 % partout ; ligne d'arrivée raisonnable proposée :
80 % des instructions du navigateur et 80 % des embranchements du serveur. Les planchers de couverture (cliquet) empêchent
toute régression : `apps/app/vitest.config.ts` (serveur) et `apps/app/vitest.components.config.ts` (navigateur).

## État actuel

- **Serveur, tests unitaires** (521 tests, contre PostgreSQL 16) : 89.62 % des instructions (6022/6719), 78.29 % des embranchements, 89.1 % des fonctions, 94.19 % des lignes.
- **Navigateur, tests unitaires** (308 tests, composants et écrans du tableau de bord) : 72.16 % des instructions (2385/3305), 66.8 % des embranchements, 65.82 % des fonctions, 74.08 % des lignes.
- **Parcours complets** (Playwright, 140 parcours dont 9 ignorés volontairement) : tous les écrans du navigateur sont ouverts
  par au moins un parcours. Dernière mesure du code exécuté, avant l'ajout des parcours `screens-gaps`, `pro-screens` et
  `two-factor` : navigateur 53,3 % des instructions (80 fichiers), serveur 56,6 % (443 fichiers).

## Comment mesurer

- Navigateur : `cd apps/app && npx vitest run -c vitest.components.config.ts --coverage` (environ 2 minutes, sans base).
- Serveur : base PostgreSQL et variables de la CI (`.github/workflows/ci.yml`), puis `cd apps/app && npx vitest run --coverage`
  (environ 6 minutes).
- Parcours complets : `ops/e2e-coverage.sh` (environ 30 minutes ; rapports dans `/tmp/e2e-coverage`). Rien n'est installé
  dans le projet ; la mesure est inactive par défaut (`E2E_COVERAGE`, `E2E_COVERAGE_DIR`).

## 1. Navigateur : tests unitaires (`apps/app/test/components`)

### Comportements à tester en priorité

- **Éditeur de plan de salle** (`SeatingEditor.tsx`) : réglages d'un bloc (rangs, places, rotation, numérotation, allée
  centrale), suppression d'un bloc (avec et sans places vendues), annuler et rétablir sur plusieurs étapes (limite de 30),
  dispositions enregistrées (enregistrer, rechercher, appliquer, supprimer), photo du plan (envoi, application), carte de
  chaleur des ventes, dimensions de chaque modèle (stade, église, tables), zoom et déplacement du fond, choix de place
  laissé à l'acheteur.
- **Panier** (`CheckoutPanel.tsx`) : questions par billet et par commande (obligatoires, choix, erreurs par champ),
  téléphone obligatoire, titulaires des billets nominatifs, changement de places, réservation expirée puis recommencée,
  annulation de la réservation, total avec code promo et options.
- **Scanner** (`ScannerApp.tsx`) : onglet de vente avec caméra, rechargement de la liste en erreur, entrée d'une porte
  nommée, passes d'options seules, bar en ligne (retrait refusé, plus rien à retirer), sons et vibrations.
- **Choix des places** (`SeatMapPicker.tsx`) : zoom et déplacement au doigt, places de l'ami (lien partagé), légende,
  places accessibles, blocs de plusieurs catégories, ami introuvable.
- **Campagnes** (`CampaignEditor.tsx`) : enregistrement comme modèle, déprogrammation, aperçu, segments par événement et
  par langue, erreurs de l'envoi de test.
- **Choix des billets** (`TicketPicker.tsx`) : paliers « prochain prix » avec dates, places de l'ami, options de table.
- **Éditeur riche des e-mails** (`EmailEditor.tsx`) : liens (ajout, retrait), couleurs, alignements, listes, citations,
  inspecteur (bouton, image, bloc HTML, carte d'événement).

### Liste complète des fichiers incomplets

| Fichier                                                              | Instructions non couvertes | Embranchements non couverts | Instructions | Embranchements |
| -------------------------------------------------------------------- | -------------------------: | --------------------------: | -----------: | -------------: |
| `app/o/[orgSlug]/events/[eventId]/seating/SeatingEditor.tsx`         |                        217 |                         197 |       57.2 % |         56.5 % |
| `components/public/CheckoutPanel.tsx`                                |                         75 |                          84 |       61.7 % |         50.9 % |
| `components/scanner/ScannerApp.tsx`                                  |                         67 |                         110 |       79.4 % |         66.6 % |
| `components/public/SeatMapPicker.tsx`                                |                         56 |                          70 |       66.1 % |         58.3 % |
| `components/public/Prepublished.tsx`                                 |                         45 |                          36 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/marketing/campaigns/CampaignEditor.tsx`             |                         41 |                          48 |       62.7 % |         57.1 % |
| `components/email/EmailEditor.tsx`                                   |                         40 |                          53 |       59.2 % |         45.4 % |
| `components/public/EventPage.tsx`                                    |                         29 |                          54 |        0.0 % |          0.0 % |
| `components/public/EventPublicView.tsx`                              |                         17 |                          87 |        0.0 % |          0.0 % |
| `components/public/TicketPicker.tsx`                                 |                         17 |                          28 |       86.4 % |         85.0 % |
| `components/shell/EventNav.tsx`                                      |                         16 |                          16 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/brand/BrandClient.tsx`                              |                         15 |                          20 |       83.3 % |         78.7 % |
| `components/ProLocked.tsx`                                           |                         15 |                          10 |        0.0 % |          0.0 % |
| `app/admin/prospection/UploadForm.tsx`                               |                         13 |                          16 |        0.0 % |          0.0 % |
| `components/shell/OrgNav.tsx`                                        |                         13 |                           6 |        0.0 % |          0.0 % |
| `components/scanner/SellPanel.tsx`                                   |                         11 |                          20 |       89.7 % |         82.0 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/ComplimentaryForm.tsx`     |                         11 |                          12 |        0.0 % |          0.0 % |
| `components/public/StripePayment.tsx`                                |                         11 |                           8 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/settings/SettingsClient.tsx`                        |                         10 |                          10 |       50.0 % |         47.4 % |
| `app/o/[orgSlug]/orders/[orderId]/OrderActions.tsx`                  |                         10 |                           7 |       86.8 % |         84.8 % |
| `app/o/[orgSlug]/events/[eventId]/ambassadors/AmbassadorForm.tsx`    |                         10 |                           2 |        0.0 % |          0.0 % |
| `components/scanner/CameraScanner.tsx`                               |                          9 |                           5 |       82.0 % |         85.7 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/TiersEditor.tsx`           |                          8 |                           5 |       77.8 % |         89.6 % |
| `app/(auth)/SocialButtons.tsx`                                       |                          7 |                          16 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/billing/ReferralCard.tsx`                           |                          7 |                           2 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/NewTicketType.tsx`         |                          7 |                           2 |        0.0 % |          0.0 % |
| `components/shell/OrgSwitcher.tsx`                                   |                          7 |                           0 |        0.0 % |        100.0 % |
| `components/public/PublicShell.tsx`                                  |                          6 |                          24 |        0.0 % |          0.0 % |
| `app/(auth)/forgot-password/ForgotForm.tsx`                          |                          6 |                           2 |        0.0 % |          0.0 % |
| `app/site/[sub]/payer/[token]/PayAtVenue.tsx`                        |                          6 |                           2 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/events/[eventId]/embed/EmbedForms.tsx`              |                          6 |                           0 |        0.0 % |        100.0 % |
| `app/o/[orgSlug]/StripeBanner.tsx`                                   |                          5 |                          12 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/events/[eventId]/EventCommands.tsx`                 |                          5 |                           7 |        0.0 % |          0.0 % |
| `app/onboarding/Steps.tsx`                                           |                          5 |                           6 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/billing/SwitchInterval.tsx`                         |                          5 |                           4 |        0.0 % |          0.0 % |
| `app/(auth)/login/LoginForm.tsx`                                     |                          5 |                           2 |        0.0 % |          0.0 % |
| `app/mon-espace/LinkForm.tsx`                                        |                          5 |                           2 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/events/[eventId]/resale/CancelListing.tsx`          |                          5 |                           2 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/events/new/NewEventForm.tsx`                        |                          5 |                           0 |        0.0 % |        100.0 % |
| `components/seating/OccupancyPlan.tsx`                               |                          4 |                          11 |       88.9 % |         45.0 % |
| `app/o/[orgSlug]/events/[eventId]/settings/EventPublication.tsx`     |                          4 |                           5 |       89.2 % |         91.5 % |
| `components/public/NotifyOpener.tsx`                                 |                          4 |                           2 |        0.0 % |          0.0 % |
| `app/(auth)/register/RegisterForm.tsx`                               |                          4 |                           0 |        0.0 % |        100.0 % |
| `app/(auth)/reset-password/ResetForm.tsx`                            |                          4 |                           0 |        0.0 % |        100.0 % |
| `app/compte/securite/SecurityForms.tsx`                              |                          3 |                           9 |       82.3 % |         55.0 % |
| `components/LocaleSwitch.tsx`                                        |                          3 |                           8 |        0.0 % |          0.0 % |
| `components/ui/Card.tsx`                                             |                          3 |                           5 |       50.0 % |         16.7 % |
| `app/(auth)/verify-email/ResendForm.tsx`                             |                          3 |                           2 |        0.0 % |          0.0 % |
| `app/2fa/VerifyForm.tsx`                                             |                          3 |                           2 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/events/[eventId]/options/OptionsRefundPolicy.tsx`   |                          3 |                           2 |        0.0 % |          0.0 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/QuestionsManager.tsx`      |                          3 |                           2 |       91.7 % |         97.0 % |
| `app/onboarding/payments/ConnectStripe.tsx`                          |                          3 |                           2 |        0.0 % |          0.0 % |
| `components/events/StatusBadge.tsx`                                  |                          3 |                           0 |        0.0 % |        100.0 % |
| `app/o/[orgSlug]/events/[eventId]/settings/SettingsForm.tsx`         |                          2 |                           7 |       94.9 % |         85.4 % |
| `app/o/[orgSlug]/events/[eventId]/settings/EventPresale.tsx`         |                          2 |                           5 |       95.5 % |         92.2 % |
| `components/public/DisabledSite.tsx`                                 |                          2 |                           2 |        0.0 % |          0.0 % |
| `components/pwa/InstallAppButton.tsx`                                |                          2 |                           2 |       92.8 % |         90.5 % |
| `components/public/HolderEditor.tsx`                                 |                          2 |                           0 |       91.3 % |        100.0 % |
| `components/shell/AccountMenu.tsx`                                   |                          2 |                           0 |        0.0 % |        100.0 % |
| `components/public/QuestionField.tsx`                                |                          1 |                           5 |       94.1 % |         89.6 % |
| `app/o/[orgSlug]/events/[eventId]/settings/EventAppearance.tsx`      |                          1 |                           4 |       97.2 % |         89.5 % |
| `app/o/[orgSlug]/marketing/ImportContacts.tsx`                       |                          1 |                           4 |       94.1 % |         78.9 % |
| `components/public/Embed.tsx`                                        |                          1 |                           4 |       97.0 % |         81.8 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/PriceFields.tsx`           |                          1 |                           2 |       96.2 % |         90.0 % |
| `components/ui/Button.tsx`                                           |                          1 |                           2 |       83.3 % |         66.7 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/TicketTypeEditor.tsx`      |                          1 |                           1 |       95.0 % |         99.0 % |
| `components/public/PresaleAutoUnlock.tsx`                            |                          1 |                           1 |       90.9 % |         87.5 % |
| `components/public/RefundRequest.tsx`                                |                          1 |                           1 |       95.8 % |         95.0 % |
| `app/o/[orgSlug]/events/[eventId]/entries/EntriesClient.tsx`         |                          1 |                           0 |       96.4 % |        100.0 % |
| `app/o/[orgSlug]/events/[eventId]/promo/PromoForm.tsx`               |                          1 |                           0 |       94.4 % |        100.0 % |
| `components/Brand.tsx`                                               |                          1 |                           0 |       66.7 % |        100.0 % |
| `components/public/ShareFriendLink.tsx`                              |                          1 |                           0 |       90.0 % |        100.0 % |
| `app/onboarding/OrganizationForm.tsx`                                |                          0 |                           3 |      100.0 % |         85.0 % |
| `components/shell/SideNav.tsx`                                       |                          0 |                           3 |      100.0 % |         88.0 % |
| `app/o/[orgSlug]/billing/VenueCard.tsx`                              |                          0 |                           2 |      100.0 % |         93.3 % |
| `components/email/EmailPreview.tsx`                                  |                          0 |                           2 |      100.0 % |         90.5 % |
| `components/pwa/PwaRegister.tsx`                                     |                          0 |                           2 |      100.0 % |         80.0 % |
| `components/seating/PlanParts.tsx`                                   |                          0 |                           2 |      100.0 % |         93.5 % |
| `app/o/[orgSlug]/events/[eventId]/settings/EventMarketingEmails.tsx` |                          0 |                           1 |      100.0 % |         90.0 % |
| `app/o/[orgSlug]/events/[eventId]/settings/EventReminders.tsx`       |                          0 |                           1 |      100.0 % |         91.7 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/FeePreview.tsx`            |                          0 |                           1 |      100.0 % |         83.3 % |
| `app/o/[orgSlug]/members/TeamClient.tsx`                             |                          0 |                           1 |      100.0 % |         97.7 % |

## 2. Serveur : tests unitaires (`apps/app/test/*.test.ts`, base PostgreSQL)

### Comportements à tester en priorité

- Embranchements d'erreur des appels à Stripe (indisponible, refus, délais) dans la facturation, les remboursements, la
  revente et les virements.
- Embranchements restants de la liste d'attente, du parrainage et de l'authentification (cas limites des jetons).
- Cas d'erreur des tâches planifiées (relances, rappels, nettoyage) quand une étape échoue au milieu.

### Liste complète des fichiers incomplets

| Fichier                          | Instructions non couvertes | Embranchements non couverts | Instructions | Embranchements |
| -------------------------------- | -------------------------: | --------------------------: | -----------: | -------------: |
| `server/checkout.ts`             |                         65 |                         101 |       85.4 % |         75.4 % |
| `server/prospection.ts`          |                         60 |                          63 |       83.3 % |         75.2 % |
| `server/finances.ts`             |                         56 |                          60 |       81.3 % |         66.8 % |
| `server/automations.ts`          |                         29 |                          21 |       78.5 % |         67.2 % |
| `server/seatingEditor.ts`        |                         26 |                          46 |       87.4 % |         76.6 % |
| `server/events.ts`               |                         24 |                          56 |       83.9 % |         69.7 % |
| `server/team.ts`                 |                         24 |                          28 |       84.2 % |         70.2 % |
| `server/resale.ts`               |                         23 |                          36 |       85.7 % |         70.7 % |
| `server/venues.ts`               |                         22 |                          37 |       88.7 % |         77.0 % |
| `server/seating.ts`              |                         22 |                          29 |       88.3 % |         80.3 % |
| `server/platform.ts`             |                         21 |                          27 |       87.0 % |         82.2 % |
| `server/tickets.ts`              |                         17 |                          43 |       82.8 % |         62.6 % |
| `server/domains.ts`              |                         17 |                          23 |       84.0 % |         72.6 % |
| `server/campaigns.ts`            |                         17 |                          22 |       88.3 % |         80.7 % |
| `server/presale.ts`              |                         17 |                          19 |       79.0 % |         71.6 % |
| `server/seatLabelsPdf.ts`        |                         15 |                          31 |       93.6 % |         75.6 % |
| `server/orders.ts`               |                         15 |                          24 |       87.0 % |         76.9 % |
| `server/refunds.ts`              |                         15 |                          24 |       91.3 % |         84.5 % |
| `server/options.ts`              |                         15 |                          22 |       89.4 % |         82.7 % |
| `server/scanner.ts`              |                         13 |                          44 |       90.6 % |         72.0 % |
| `server/ambassadors.ts`          |                         13 |                          18 |       88.8 % |         75.7 % |
| `server/brand.ts`                |                         12 |                          25 |       85.4 % |         73.7 % |
| `server/billing.ts`              |                         11 |                          41 |       90.4 % |         71.9 % |
| `server/waitlist.ts`             |                         11 |                          14 |       90.8 % |         80.8 % |
| `server/notifications.ts`        |                         10 |                           9 |       87.3 % |         83.9 % |
| `server/embed.ts`                |                          9 |                           8 |       77.5 % |         75.8 % |
| `server/seatingPhoto.ts`         |                          8 |                          20 |       84.9 % |         67.2 % |
| `server/contactsImport.ts`       |                          8 |                          17 |       92.0 % |         77.6 % |
| `server/organization.ts`         |                          6 |                          10 |       88.2 % |         82.5 % |
| `server/participant.ts`          |                          6 |                          10 |       88.0 % |         75.6 % |
| `server/complimentary.ts`        |                          6 |                           9 |       84.2 % |         73.5 % |
| `server/wallet/service.ts`       |                          6 |                           6 |       79.3 % |         73.9 % |
| `server/tables.ts`               |                          6 |                           2 |       75.0 % |         88.2 % |
| `server/publicEvents.ts`         |                          5 |                          22 |       93.4 % |         78.6 % |
| `server/email/send.ts`           |                          5 |                           9 |       90.4 % |         78.0 % |
| `server/ticketsPdf.ts`           |                          5 |                           7 |       94.2 % |         75.0 % |
| `server/questions.ts`            |                          4 |                          14 |       95.3 % |         77.8 % |
| `server/email/campaignRender.ts` |                          4 |                           4 |       83.3 % |         66.7 % |
| `server/twoFactor.ts`            |                          4 |                           4 |       94.4 % |         89.2 % |
| `server/unsubscribe.ts`          |                          4 |                           4 |       90.9 % |         91.1 % |
| `server/boxOffice.ts`            |                          3 |                          14 |       96.3 % |         83.3 % |
| `server/calendar.ts`             |                          3 |                          10 |       92.7 % |         67.7 % |
| `server/seatingLayouts.ts`       |                          3 |                          10 |       94.4 % |         73.0 % |
| `server/referrals.ts`            |                          3 |                           8 |       94.2 % |         86.2 % |
| `server/alerts.ts`               |                          3 |                           3 |       88.9 % |         82.3 % |
| `server/botProtection.ts`        |                          3 |                           2 |       90.3 % |         93.5 % |
| `server/onboarding.ts`           |                          3 |                           1 |       88.0 % |         87.5 % |
| `server/stripeConnect.ts`        |                          2 |                           6 |       97.0 % |         89.5 % |
| `server/promos.ts`               |                          2 |                           5 |       95.7 % |         90.0 % |
| `server/publication.ts`          |                          2 |                           5 |       94.1 % |         84.8 % |
| `server/storage.ts`              |                          2 |                           3 |       94.9 % |         90.9 % |
| `server/emailEvents.ts`          |                          2 |                           2 |       97.1 % |         96.7 % |
| `server/requestInfo.ts`          |                          2 |                           1 |       71.4 % |         87.5 % |
| `server/wallet/sync.ts`          |                          1 |                           6 |       97.5 % |         78.6 % |
| `server/email/eventBlock.ts`     |                          1 |                           5 |       90.0 % |         58.3 % |
| `server/emailCheck.ts`           |                          1 |                           3 |       96.8 % |         89.3 % |
| `server/eventEmailBlocks.ts`     |                          1 |                           3 |       96.9 % |         87.5 % |
| `server/wallet/apple.ts`         |                          1 |                           3 |       96.3 % |         85.7 % |
| `server/wallet/googleApi.ts`     |                          1 |                           1 |       91.7 % |         75.0 % |
| `lib/pwa.ts`                     |                          1 |                           0 |        0.0 % |        100.0 % |
| `server/wallet/push.ts`          |                          1 |                           0 |       95.2 % |        100.0 % |
| `server/email/templates.ts`      |                          0 |                          36 |      100.0 % |         78.0 % |
| `server/stripeConnectEvents.ts`  |                          0 |                          12 |      100.0 % |         76.5 % |
| `server/seatLabels.ts`           |                          0 |                           7 |      100.0 % |         87.9 % |
| `server/wallet/ticket.ts`        |                          0 |                           5 |      100.0 % |         77.3 % |
| `lib/auth.ts`                    |                          0 |                           3 |      100.0 % |         62.5 % |
| `server/audit.ts`                |                          0 |                           3 |      100.0 % |         81.2 % |
| `server/contacts.ts`             |                          0 |                           2 |      100.0 % |         85.7 % |
| `server/email/brand.ts`          |                          0 |                           2 |      100.0 % |         94.9 % |
| `server/ordersAdmin.ts`          |                          0 |                           2 |      100.0 % |         94.9 % |
| `server/plans.ts`                |                          0 |                           2 |      100.0 % |         85.7 % |
| `server/seo.ts`                  |                          0 |                           2 |      100.0 % |         85.7 % |
| `lib/stripe.ts`                  |                          0 |                           1 |      100.0 % |         75.0 % |
| `server/canonical.ts`            |                          0 |                           1 |      100.0 % |         95.0 % |
| `server/context.ts`              |                          0 |                           1 |      100.0 % |         97.6 % |
| `server/guard.ts`                |                          0 |                           1 |      100.0 % |         96.9 % |
| `server/rateLimit.ts`            |                          0 |                           1 |      100.0 % |         83.3 % |

## 3. Parcours complets (`apps/app/e2e`)

### Parcours fonctionnels encore absents

- Paiement par carte de bout en bout avec Stripe en mode test : panier payant, 3-D Secure, refus de la carte, paiement
  sur place par carte depuis le QR code.
- Remboursement réel par Stripe, et réception des webhooks Stripe (paiement, remboursement, litige, compte connecté).
- Souscription à l'offre Pro par Stripe Checkout, et portail de facturation.
- Ouverture d'un compte Stripe Connect par l'organisateur.
- Ambassadeurs : vente par le lien d'un ambassadeur et classement.
- Prévente : achat avec un code, code épuisé, lien `?prevente=CODE`.

### Code le moins exercé par les parcours (dernière mesure)

Navigateur :

| Fichier                                                    | Instructions non exercées | Instructions exercées |
| ---------------------------------------------------------- | ------------------------: | --------------------: |
| `components/scanner/ScannerApp.tsx`                        |                        45 |                69.8 % |
| `components/public/SeatMapPicker.tsx`                      |                        40 |                36.5 % |
| `app/o/[orgSlug]/marketing/campaigns/CampaignEditor.tsx`   |                        36 |                21.7 % |
| `app/o/[orgSlug]/brand/BrandClient.tsx`                    |                        35 |                 2.8 % |
| `components/public/CheckoutPanel.tsx`                      |                        33 |                56.0 % |
| `components/scanner/CameraScanner.tsx`                     |                        24 |                22.6 % |
| `components/scanner/SellPanel.tsx`                         |                        22 |                46.3 % |
| `components/public/botProof.ts`                            |                        14 |                 0.0 % |
| `components/public/ResaleControl.tsx`                      |                        13 |                38.1 % |
| `components/seating/OccupancyPlan.tsx`                     |                        13 |                 0.0 % |
| `components/public/Countdown.tsx`                          |                        12 |                 0.0 % |
| `components/public/embedEvents.ts`                         |                        12 |                 7.7 % |
| `app/o/[orgSlug]/events/[eventId]/tickets/TiersEditor.tsx` |                        11 |                 0.0 % |
| `components/email/EmailEditor.tsx`                         |                        11 |                56.0 % |
| `components/public/TicketPicker.tsx`                       |                        11 |                73.8 % |
| `components/public/WaitlistJoin.tsx`                       |                        11 |                 0.0 % |
| `components/public/ResaleBuy.tsx`                          |                         9 |                 0.0 % |
| `components/seating/PlanParts.tsx`                         |                         9 |                60.9 % |
| `components/public/Embed.tsx`                              |                         8 |                50.0 % |
| `components/public/QuestionField.tsx`                      |                         8 |                11.1 % |

Serveur :

| Fichier                                                      | Instructions non exercées | Instructions exercées |
| ------------------------------------------------------------ | ------------------------: | --------------------: |
| `server/prospection.ts`                                      |                       147 |                38.5 % |
| `components/scanner/ScannerApp.tsx`                          |                       130 |                12.8 % |
| `server/checkout.ts`                                         |                       122 |                61.6 % |
| `app/o/[orgSlug]/events/[eventId]/seating/SeatingEditor.tsx` |                       102 |                32.9 % |
| `server/venues.ts`                                           |                        98 |                29.5 % |
| `server/team.ts`                                             |                        84 |                39.6 % |
| `app/o/[orgSlug]/events/actions.ts`                          |                        79 |                57.1 % |
| `server/billing.ts`                                          |                        76 |                16.5 % |
| `server/presale.ts`                                          |                        76 |                10.6 % |
| `server/domains.ts`                                          |                        74 |                16.9 % |
| `components/public/CheckoutPanel.tsx`                        |                        64 |                14.7 % |
| `server/automations.ts`                                      |                        63 |                30.0 % |
| `components/public/SeatMapPicker.tsx`                        |                        62 |                 1.6 % |
| `app/admin/prospection/actions.ts`                           |                        61 |                23.8 % |
| `server/refunds.ts`                                          |                        59 |                57.9 % |
| `server/waitlist.ts`                                         |                        59 |                41.0 % |
| `server/platform.ts`                                         |                        51 |                55.6 % |
| `server/contactsImport.ts`                                   |                        49 |                 0.0 % |
| `server/emailEvents.ts`                                      |                        48 |                 0.0 % |
| `server/options.ts`                                          |                        45 |                66.2 % |
| `server/resale.ts`                                           |                        45 |                65.1 % |
| `server/seating.ts`                                          |                        44 |                66.4 % |
| `server/seatingEditor.ts`                                    |                        43 |                66.7 % |
| `app/site/[sub]/[eventSlug]/actions.ts`                      |                        42 |                67.7 % |
| `app/o/[orgSlug]/marketing/campaigns/CampaignEditor.tsx`     |                        41 |                10.9 % |

### Limites connues de la mesure

- Le parcours de la caméra du scanner lance son propre navigateur : il n'est pas mesuré.
- Le paiement sur place (`PayAtVenue.tsx`) et l'import de prospects (`UploadForm.tsx`) sont testés de bout en bout
  (`onsite-sales.spec.ts`, `prospection.spec.ts`) mais absents de la mesure : leurs scripts n'ont probablement pas de carte
  de correspondance. À vérifier.
- Seuls les fichiers chargés par au moins une page sont comptés.

## 4. Couverts autrement (pas de test unitaire possible)

- Composants du serveur (`Prepublished.tsx`, `EventPage.tsx`, pages `page.tsx`, mises en page) : couverts par les
  parcours complets.
