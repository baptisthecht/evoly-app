# Evoly v2

Billetterie en libre-service pour les organisateurs d'événements. *Ton prochain souvenir t'attend.*

La référence fonctionnelle est **[docs/CDC.md](docs/CDC.md)** (cahier des charges v2) : toute décision d'implémentation doit y être conforme.

## Contenu

| Dossier | Rôle | État |
|---|---|---|
| `apps/web` | Site vitrine evoly.me (page HTML autonome générée par `build.py`) | Livré |
| `apps/app` | Tableau de bord, billetterie publique, API, webhooks | Comptes, onboarding, tableau de bord, encaissement Stripe livrés ; 9 parcours testés dans Chromium |
| `apps/scanner` | PWA de contrôle d'accès | À reprendre de `legacy/scanner-v1` et corriger (étape 5) |
| `packages/core` | Logique métier pure : commission, paliers, codes promo, panier, revente, remboursements, offres, permissions, cycles de vie | Livré, 112 tests |
| `packages/db` | Schéma Prisma 7 (52 modèles), contraintes SQL, client, données de départ | Livré, schéma validé |
| `packages/i18n` | Langues (fr, en), messages traduits, formats de montants et de dates | Livré, socle de messages |
| `packages/ui` | Design system : jetons de la charte, pont Tailwind 4, polices auto-hébergées, tracés du logo | Livré |
| `legacy/` | Code de la v1, hors workspace, gardé comme référence pour le portage | Lecture seule |

## Démarrer

Prérequis : Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env            # puis renseigner DATABASE_URL et le reste
pnpm db:generate                 # client Prisma
pnpm --filter @evoly/db exec prisma migrate dev --create-only --name init
# ajouter le contenu de packages/db/prisma/sql/constraints.sql à la fin du fichier de migration créé
pnpm db:migrate                  # applique la migration
pnpm db:seed                     # offres Free et Pro, rôles système
pnpm test                        # tests unitaires
pnpm --filter @evoly/app dev     # app sur http://localhost:3001
```

Parcours complets (Playwright), app démarrée sur une base de test et `EMAIL_OUTBOX_DIR` défini :

```bash
cd apps/app && npx playwright install chromium && npx playwright test
```

## Règles de travail

- Aucun calcul d'argent en dehors de `packages/core` (RG-ARC-02). Chaque règle n'existe qu'à un endroit, et elle est testée.
- Chaque action serveur suit : validation, authentification, autorisation (`can`), offre (`hasFeature`), appartenance à l'organisation, transaction (RG-ARC-03).
- Montants en unités mineures, devises ISO 4217, taux en points de base, dates en UTC.
- Aucune couleur ni typographie en dur : tout passe par `packages/ui`.
- Tout texte visible passe par `packages/i18n`, dans les deux langues du lancement (typographie française : apostrophes courbes, espaces insécables).
- Authentification : Better Auth (CDC, décision 16). Les jetons sont stockés hachés, les mots de passe en Argon2id.
- Les décisions encore ouvertes sont listées en section 17 du CDC ; leur valeur par défaut est celle implémentée.

## Billetterie et paiements

- **Pages publiques** : `mon-asso.evoly.me/[événement]`, réécrites par `apps/app/src/proxy.ts` vers `/site/[sub]/…`. `NEXT_PUBLIC_BASE_DOMAIN` est figé à la construction ; en local, `localhost:3001` donne `http://mon-asso.localhost:3001`.
- **Réservation** (`src/server/checkout.ts`) : ligne de l'événement verrouillée, incréments conditionnels, contraintes CHECK en base. Testé sous concurrence (`pnpm --filter @evoly/app test`, base PostgreSQL requise).
- **Paiement** : charges directes sur le compte de l'organisateur, commission en `application_fee_amount`, Payment Element en création différée.
- **Webhooks Connect** à activer sur `/api/webhooks/stripe/connect` : `account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`, `payment_intent.payment_failed`.
- **Tâche planifiée** : `GET /api/cron/holds` chaque minute (`Authorization: Bearer $CRON_SECRET`) pour libérer les réservations expirées. Elles sont aussi libérées à chaque nouvelle réservation sur l'événement.
- **Liens magiques** : dérivés par HMAC (`ORDER_TOKEN_SECRET`) et versionnés (`Order.accessTokenVersion`) ; seul leur hachage est stocké.
- **Codes promo** (`src/server/promos.ts`, onglet « Codes promo ») : pourcentage, montant par billet ou gratuité ; validés à la réservation, réservations en cours comptées dans la limite, compteur incrémenté au paiement.
- **Billets nominatifs** : titulaires saisis avant le paiement (`OrderItem.holders`), reportés sur les billets, modifiables jusqu'au début de l'événement.
- **Après l'achat** : PDF (une page par billet) et fichier ICS joints à l'e-mail, page des billets avec QR codes, « Retrouver mes billets » (`/billets`, 3 demandes par heure et par adresse).

## Scanner d'entrée

- **Hôte** : `scanner.evoly.me/s/[jeton]`, réécrit par le proxy vers `/scanner/s/[jeton]`. Jeton dérivé par HMAC (réaffichable dans l'onglet Entrées), seul son hachage est stocké (`ScannerLink.tokenHash`).
- **API** (`/api/scanner/[jeton]/…`) : `manifest` (liste locale : codes hachés avec le sel du lien, code court, titulaire, tarif, statut, sans aucune donnée financière), `scan` (validation atomique, journal `CheckIn` immuable), `sync` (scans hors ligne, le premier horodaté l'emporte). Lien expiré ou révoqué : 410. Débit limité par lien et par appareil.
- **Hors ligne** : liste locale rafraîchie toutes les 30 secondes, scans mis en file puis synchronisés au retour du réseau ; `public/scanner-sw.js` permet de recharger le scanner sans réseau. La liste est effacée de l'appareil quand le lien expire ou est révoqué.
- **Caméra** : `BarcodeDetector` quand le navigateur le propose, sinon `jsQR`. La caméra exige HTTPS en production (ou `localhost`).
- **Membres** : « Ouvrir le scanner » (onglet Entrées) crée un lien personnel valable jusqu'à la fin du jour de l'événement.

## Revente entre participants

- **Mise en vente** depuis la page des billets (`src/server/resale.ts`) : prix au plus égal à la valeur faciale (contrôlé côté serveur et par la contrainte `ResaleListing_price_le_face_value`), une seule annonce ouverte par billet (index unique partiel), paiement d'origine encore remboursable (RG-RSL-05). Le QR code est masqué tant que l'annonce est ouverte.
- **Achat** : l'annonce est réservée pendant la durée de réservation de l'événement ; commande `RESALE`, charge directe sur le compte de l'organisateur avec la commission de revente. À la validation, dans une seule transaction : ancien billet `VOID` (`RESOLD`), nouveau billet et nouveau code pour l'acheteur, annonce `SOLD`. Aucune place n'est vendue en plus.
- **Vendeur** : remboursement partiel de sa commande d'origine, prix moins la commission et les frais Stripe réels du paiement de l'acheteur (RG-FEE-51) ; l'organisateur reste neutre. En cas d'échec, l'annonce passe `FAILED` et l'acheteur garde son billet (RG-RSL-06).
- **Revente à 0 €** : transfert, sans paiement ni remboursement.
- **Fermetures** : retrait par le vendeur (si non réservée) ou l'organisateur, désactivation de la revente de l'événement ou d'un tarif, billet scanné, fin de la revente (tâche `/api/cron/holds`).
- **Liens** : `evoly.me/r/[code]` redirige vers `mon-asso.evoly.me/revente/[code]`.

## Commandes, remboursements et finances

- **Commandes** (`/o/[org]/orders`) : recherche par nom, e-mail, référence ou code de billet ; détail complet (paiement, billets, passages, remboursements, reventes, e-mails envoyés) ; renvoi des billets ; correction de l'e-mail (nouveau lien, l'ancien est invalidé).
- **Remboursements** (`src/server/refunds.ts`) : demande de l'acheteur selon la politique (acceptée d'office pour « toujours », « jusqu'à une date limite » dans les délais, ou 14 jours après un changement de date ou de lieu) ; décision de l'organisateur ; remboursement de billets choisis à tout moment. Billets désactivés dès l'envoi à Stripe, commission non restituée (`REFUND_APPLICATION_FEE = false`). Échec : relance depuis le détail de la commande.
- **Annulation** d'un événement : motif et saisie du titre ; remboursement intégral automatique des commandes payées, billets gratuits annulés, réservations libérées, annonces de revente retirées, acheteurs prévenus. Traitement synchrone pour l'instant : à passer dans une file pour les très gros événements.
- **Webhooks Connect** à ajouter : `charge.refund.updated`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
- **Finances** (`/o/[org]/finances`, `src/server/finances.ts`) : totaux par période et par événement, état du compte Stripe, soldes et virements lus chez Stripe (jamais déclenchés par Evoly), litiges, exports CSV (`;`, virgule décimale).
- **Relevés de commissions** : un par mois, organisation et devise, numéro tiré de la séquence `commission_statement_number_seq`, PDF envoyé au propriétaire. Tâche mensuelle : `GET /api/cron/statements` le 1er du mois (`Authorization: Bearer $CRON_SECRET`). Émetteur : `EVOLY_LEGAL_NAME`, `EVOLY_LEGAL_ADDRESS`, `EVOLY_VAT_NUMBER`. ⚠ Traitement de la TVA sur la commission (`commissionVat` dans `packages/core`) à valider avec l'expert-comptable.

## Abonnement Pro

- **Vente** (`src/server/billing.ts`) : Stripe Checkout en mode abonnement sur le compte Stripe d'Evoly (pas sur celui de l'organisateur), carte exigée, essai de 14 jours une seule fois par organisation, mensuel ou annuel. Prix : `STRIPE_PRICE_PRO_MONTH` et `STRIPE_PRICE_PRO_YEAR` (prix TTC créés dans Stripe) ; à défaut, les montants de `PlanCurrencyTerms` sont envoyés tels quels. `STRIPE_TAX_ENABLED=true` active Stripe Tax.
- **Portail client** : à configurer dans Stripe (changement de périodicité avec prorata, moyen de paiement, factures, résiliation en fin de période).
- **Webhooks de la plateforme** (`/api/webhooks/stripe/platform`, `STRIPE_WEBHOOK_SECRET_PLATFORM`) : `checkout.session.completed`, `customer.subscription.created`, `.updated`, `.deleted`, `.trial_will_end`, `invoice.paid`, `invoice.payment_failed`.
- **Retour en Free** : calculé à la volée depuis le plan effectif, rien n'est supprimé (plafond de commission, marque, paliers en lecture seule, membres non propriétaires suspendus, organisations supplémentaires en lecture seule). Impayé : 7 jours de grâce, bandeau dans le tableau de bord, e-mail à chaque échec ; la tâche `/api/cron/holds` prévient le propriétaire à la rétrogradation.

## Marque et domaines

- **Fichiers** (`src/server/storage.ts`) : Cloudflare R2 si `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` et `R2_PUBLIC_URL` sont renseignés ; sinon dossier local `UPLOADS_DIR` servi par `/files/…` (développement). Images PNG, JPEG ou WebP uniquement, type vérifié sur les octets (SVG refusé).
- **Marque** (Pro) : nom affiché, logo (couleurs proposées d'après ses couleurs dominantes), icône, couleur principale (bandeau) et d'accent (pastilles, boutons), texte en charbon ou blanc selon le contraste, nom d'expéditeur et adresse de réponse, retrait de la mention Evoly.
- **Adresses** (`resolveSite` dans `src/server/publicEvents.ts`) : sous-domaine d'organisation (toutes offres, changement avec redirection 301 de l'ancien pendant 6 mois), sous-domaine d'événement (Pro), domaine personnalisé (Pro, organisation ou événement). En Free : domaines désactivés (page d'erreur Evoly avec lien), sous-domaines d'événement redirigés vers l'organisation ; rien n'est supprimé.
- **Domaines personnalisés** : CNAME vers `CUSTOM_DOMAIN_TARGET` (par défaut `domains.<domaine de base>`), vérifié à la demande et par `GET /api/cron/domains` toutes les 10 minutes pendant 48 heures. Certificats à la demande : le proxy d'entrée interroge `GET /api/domains/allowed?domain=…` (Caddy `on_demand_tls ask`). Domaines de paiement Apple Pay et Google Pay déclarés automatiquement sur le compte Stripe de l'organisateur.
- **Adresse canonique** (`src/server/canonical.ts`) : domaine personnalisé, puis sous-domaine d'événement, puis sous-domaine d'organisation (RG-DOM-06).

## Membres et rôles

- **Invitations** (`src/server/team.ts`, Pro) : par e-mail avec un rôle, valables 48 heures, à usage unique (jeton aléatoire, seule son empreinte est stockée) ; l'adresse vérifiée du compte doit être celle de l'invitation. Sans compte : inscription depuis le lien (adresse préremplie), puis adhésion automatique à l'onboarding après vérification de l'adresse.
- **Anti-escalade** (`canAssignRole` dans `packages/core`) : personne n'attribue ni ne crée un rôle accordant une permission qu'il n'a pas ; le rôle de propriétaire ne s'attribue pas, il se transfère.
- **Propriétaire** : toujours un seul ; ni retiré, ni rétrogradé, ne quitte pas l'organisation sans transfert (l'ancien propriétaire devient administrateur).
- **Rôles personnalisés** (Pro) : permissions cochées par groupe ; suppression refusée tant qu'un membre ou une invitation l'utilise.
- **Retour en Free** : les membres autres que le propriétaire sont suspendus à la volée (aucune donnée supprimée).

## Marque dans les e-mails et les PDF

- `src/server/email/brand.ts` : en Pro, nom d'expéditeur, adresse de réponse, logo et couleur d'accent dans les e-mails aux acheteurs (confirmation, retrouver mes billets, revente, remboursements) ; couleur principale, logo (PNG ou JPEG) et retrait de la mention Evoly dans le PDF des billets. Les e-mails de compte et d'abonnement restent aux couleurs d'Evoly.

## Paramètres et suppression de l'organisation

- **Paramètres** (`src/server/organization.ts`) : identité, contact, région, adresse et TVA des relevés (numéro normalisé, 8 à 12 caractères après le préfixe du pays) ; devise bloquée après la première vente.
- **Suppression** (propriétaire, case cochée puis nom saisi) : refusée tant qu'un événement à venir a des participants ou qu'un abonnement Pro va se renouveler. Les commandes restent pour la comptabilité, anonymisées ; contacts, marque, domaines, équipe et invitations sont supprimés ; le sous-domaine est libéré.

## Contacts, désinscription et rappels

- **Contacts** (`/o/[org]/marketing`) : un par adresse et par organisation, consentement daté avec sa source, désinscription, historique d'achat ; export CSV (permission `CONTACTS_EXPORT`).
- **Désinscription** (`src/server/unsubscribe.ts`) : lien signé sans connexion, de l'événement ou de toute l'organisation (`/desinscription/…`), en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` (désinscription en un clic, `POST /api/unsubscribe/…`). Transactionnel toujours envoyé, service bloqué par la désinscription de l'événement, marketing seulement avec consentement.
- **Rappels J-7, J-1 et jour J** (Pro, `src/server/automations.ts`) : 10 h, 10 h et 8 h dans le fuseau de l'événement, une fois par commande, jamais après le début ni pour un événement annulé. Tâche : `GET /api/cron/automations` toutes les 15 minutes (`Authorization: Bearer $CRON_SECRET`).

## Campagnes et délivrabilité

- **Campagnes** (Pro, `src/server/campaigns.ts`) : éditeur par blocs (titre, texte, image, bouton, séparateur, événement rempli automatiquement), modèles (annonce, dernières places, remerciement, page vierge), personnalisation `{{prenom}}`, destinataires (tous les consentants, participants d'événements présents ou absents, par langue) avec estimation, aperçu ordinateur et téléphone, envoi de test, envoi immédiat ou programmé. Jamais sans destinataire ; une campagne envoyée n'est ni modifiable ni renvoyable ; programmée : modifiable jusqu'à 30 minutes avant, annulable jusqu'à 5 minutes avant ; annulée si son événement l'est (auteur prévenu).
- **Envoi** : `GET /api/cron/campaigns` toutes les 5 minutes (`Authorization: Bearer $CRON_SECRET`), par lots, dans la limite de `Organization.marketingDailyCap` (reprise le lendemain) ; destinataires recalculés à chaque lot ; pied de page obligatoire et en-têtes de désinscription en un clic.
- **Délivrabilité** (`POST /api/webhooks/resend`, `RESEND_WEBHOOK_SECRET`) : signature Svix vérifiée ; livraisons, ouvertures, clics comptés une fois par message ; rebond définitif et plainte ajoutés à la liste de blocage de l'organisation ; au-delà de 0,3 % de plaintes sur 30 jours (et 1 000 envois délivrés), envois marketing suspendus (`marketingDailyCap = 0`). Événements Resend à activer : `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
- **Messages ICU** : les accolades littérales (`{{prenom}}`) s'échappent avec des apostrophes droites (`'{{'prenom'}}'`).

## E-mails marketing automatiques et modèles

- **Remerciement après l'événement** et **dernières places** (Pro, désactivés par défaut, réglages de l'événement) : objet et message modifiables ; remerciement 2 heures après la fin (au plus tard 24 heures après) aux participants consentants, avec la prochaine date publique de l'organisation ; dernières places quand il reste moins de 10 % de la jauge (jamais pour une jauge illimitée), aux contacts consentants sans billet pour l'événement. Une fois par contact, dans la limite du plafond quotidien. Lancés par `GET /api/cron/automations` avec les rappels.
- **Campagnes** : import d'image (type `campaign` de la route d'import), destinataires filtrables par tarif, modèles personnels réutilisables (« Enregistrer comme modèle »).
- **Suspension** pour trop de plaintes : e-mail au propriétaire et bandeau sur la page Contacts et e-mails.

## Questions à l'achat et événements privés

- **Questions** (onglet Billets, `src/server/questions.ts`) : texte court ou long, choix unique ou multiple, case, nombre, date, téléphone, e-mail ; obligatoires ou non ; une fois par commande ou pour chaque billet ; pour tous les tarifs ou certains. Réponses revérifiées côté serveur ; réponses par billet rattachées aux billets à leur création ; visibles dans le détail de la commande et exportables en CSV. Une question qui a des réponses ne se supprime pas : elle s'archive, et son type ne change plus. Achat en revente : aucune question (les réponses d'origine restent sur la commande du vendeur).
- **Événements privés** (réglages de l'événement) : code d'accès de 4 à 32 caractères (casse et espaces ignorés), seul son hachage est stocké. Accès mémorisé 30 jours dans un cookie signé et lié au code : changer le code révoque les accès donnés. Sans accès : page réduite au formulaire de code, métadonnées génériques, réservation refusée côté serveur ; tentatives limitées.

## Notifications, entrées et billets non valables

- **Notifications** (`src/server/notifications.ts`, section 9.20) : cloche avec compteur (barre latérale et en-tête mobile), page paginée, ouverture de l'élément concerné, « tout marquer comme lu ». Un exemplaire par membre autorisé (RG-NTF-01) ; Stripe, litige et remboursement demandé aussi envoyés par e-mail au propriétaire et aux administrateurs (RG-NTF-02). Nouvelles commandes regroupées au-delà de 10 par heure ; paliers de jauge 50 %, 80 % et complet, une fois chacun. Types branchés : commande, jauge, remboursement demandé, revente conclue, nouveau membre, action requise sur Stripe, échec de paiement et fin d'essai de l'abonnement, domaine actif ou en erreur, événement annulé, campagne envoyée, litige ouvert.
- **Alerte support** : remboursement du vendeur d'une revente impossible → e-mail à `SUPPORT_EMAIL`.
- **Annulation d'une entrée** (RG-SCN-02, permission `CHECKIN_MANAGE`) : depuis le détail de la commande, motif obligatoire ; le journal `CheckIn` reste immuable (ligne `REVERTED` ajoutée), le billet redevient valable.
- **PDF des billets** : un billet revendu, remboursé ou annulé est barré, sans QR code ; le PDF d'une commande en partie remboursée se télécharge.

## Documents légaux (site vitrine)

- Sources Markdown dans `apps/web/legal/` : conditions d'utilisation des organisateurs (`cgu`), conditions de vente des participants (`conditions-de-vente`), accord de sous-traitance (`sous-traitance`), politique de confidentialité et sous-traitants (`privacy`), politique cookies (`cookies`), mentions légales (`legal`).
- `python3 apps/web/legal.py` (lancé par `pnpm --filter @evoly/web build`) produit `dist/<adresse>/index.html`, aux adresses déjà utilisées par le site et l'app (`evoly.me/cgu`, `/privacy`, `/cookies`, `/legal`…). Aucune dépendance : convertisseur Markdown minimal intégré.
- ⚠ Projets à faire valider par un avocat ; les éléments entre crochets (société, BCE, TVA, hébergeur, contacts) sont à compléter. Version `2026-09`, alignée sur `TERMS_VERSION` et `BUYER_TERMS_VERSION`.
- Liens : inscription (conditions d'utilisation et accord de sous-traitance), formulaire d'achat (conditions de vente et politique de confidentialité).

## Titulaires et accès membre au scanner

- **E-mail de chaque titulaire** (RG-QST-01) : option « Demander aussi l'e-mail de chaque titulaire » d'un tarif nominatif (`TicketType.requireHolderEmail`) ; adresse vérifiée côté serveur, enregistrée sur le billet (`Ticket.holderEmail`), visible dans la commande et l'export des billets.
- **Accès membre au scanner** (US-SCN-06) : l'accueil de `scanner.evoly.me` propose « Je fais partie de l'équipe » → `app.evoly.me/acces-scanner` (connexion requise) → choix d'un événement en cours ou proche → scanner ouvert avec un lien personnel. Aucune session partagée entre les deux domaines.
- **Base de données** : aucune migration n'est encore versionnée ; la migration initiale (`prisma migrate dev --create-only --name init`) se crée au premier déploiement et contient tout le schéma actuel.

## Back-office Evoly

- **Accès** (`/admin`, `src/server/platform.ts`) : comptes `platformRole` SUPPORT (lecture) ou ADMIN (actions). Double authentification TOTP obligatoire : secret chiffré (AES-256-GCM), enregistré à la première connexion (QR code ou clé), code demandé à chaque session (12 heures), tentatives limitées, validations et échecs journalisés.
- **Recherche** : organisations, utilisateurs, événements, commandes, billets, annonces de revente.
- **Fiche organisation** : offre, abonnement, compte Stripe, volumes, remboursements, litiges, reventes en échec, événements, fonctionnalités, journal d'audit.
- **Actions (ADMIN, journalisées)** : suspendre (ventes interrompues, membres en lecture seule, e-mail au propriétaire) ou réactiver ; prolonger un essai (aussi chez Stripe) ; attribuer une offre (Pro jusqu'à une date ou sans limite, refusé si l'abonnement est géré par Stripe) ; renvoyer les e-mails d'une commande ; relancer une revente en échec ; activer une fonctionnalité (`FeatureFlag`, par organisation ou globale, `featureEnabled()`).
- **Consultation en lecture seule** de l'app d'un organisateur : ouverte depuis la fiche (1 heure, liée à la session), journalisée, bandeau permanent ; toute action reste refusée (les actions exigent d'être membre).
- **Tableau de bord** : ventes et commissions sur 30 jours, organisations actives, abonnements, taux de litiges et de remboursements sur 90 jours, signaux de risque (nouvelle organisation avec un billet à 150 € ou plus, litiges anormaux, remboursements nombreux).
- Pages en français uniquement (outil interne). Pour donner l'accès : `update "User" set "platformRole" = 'ADMIN' where email = '…'`.
- **Base** : champs `User.twoFactorSecret` et `User.twoFactorEnabled` ajoutés (compris dans la migration initiale).

## Double authentification et mise en production

- **Double authentification** (`src/server/twoFactor.ts`, US-AUTH-06) : TOTP, secret chiffré, 8 codes de secours hachés à usage unique, validation liée à la session (12 heures). Activée depuis « Sécurité du compte » (`/compte/securite`) ; code demandé par `/2fa` après la connexion ; exigée pour les pages (`requireUser`) comme pour les actions (`runOrgAction`). Obligatoire et non désactivable pour l'équipe Evoly (back-office).
- **Mise en production** : un seul VPS Debian 13, Docker Compose (Caddy, l'app, PostgreSQL). Fichiers : `Dockerfile`, `compose.yaml`, dossier `ops/` (installation du serveur, fichier d'environnement, premier démarrage, mises à jour, tâches planifiées, sauvegardes vers R2 et restauration). Procédure pas à pas : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

## Billets offerts, filtres et suivi en direct

- **Billets offerts** (US-ORD-03, onglet Billets, `src/server/complimentary.ts`) : liste d'adresses collée (une par ligne, avec ou sans nom, format tableur accepté), 1 à 10 billets par invité, 200 invités par envoi. Une commande `COMPLIMENTARY` par invité : 0 €, sans commission, décomptée de la jauge (places réservées sous verrou, finalisation identique à une commande gratuite), e-mail avec PDF ; contact créé sans consentement marketing ; envoi partiel rapporté ligne par ligne. Pas de notification de vente pour ces commandes.
- **Commandes** : filtre par tarif (US-ORD-01) une fois l'événement choisi ; mention « Offert ».
- **Suivi en direct** (US-STAT-01) : l'aperçu d'un événement se met à jour toutes les 30 secondes ; la page des entrées l'était déjà (US-STAT-02).
- **Export des participants** (US-STAT-03) : `/o/[org]/events/[id]/participants` (CSV, un billet par ligne), permission `ORDERS_VIEW`.

## Apple Wallet et Google Wallet

- **US-POST-03** (`src/server/wallet/`) : boutons sous chaque billet valable de la page des billets, affichés seulement si les identifiants sont configurés (voir `docs/DEPLOIEMENT.md`, section 6).
- **Apple** : `.pkpass` construit à la volée (pass.json « eventTicket », icônes et logo intégrés, manifeste SHA-1, signature PKCS#7 détachée avec le certificat du type de pass et le certificat intermédiaire WWDR). Couleurs de la marque en Pro, texte contrasté.
- **Google** : lien « Enregistrer dans Google Wallet » (jeton RS256 signé par le compte de service, classe d'événement et billet dans le jeton).
- Même QR code que le billet ; seuls les billets valables d'une commande payée, via le lien personnel de l'acheteur.
- Tests avec des identifiants générés à la volée : signature vérifiée par OpenSSL (et refusée si le manifeste est modifié), jeton vérifié avec la clé publique.

## Préparation au lancement (sécurité, accessibilité, performances)

- **En-têtes** (`apps/app/next.config.ts`) : caméra autorisée pour l'app elle-même (scanner des entrées ; elle était bloquée), paiement pour Stripe, HSTS, politique de contenu en production (scripts, cadres et connexions limités à l'app et à Stripe, intégration dans un autre site interdite).
- **Redirections** : `safeNext()` (`src/lib/safeRedirect.ts`) n'accepte que des chemins internes (refuse `//`, la barre oblique inverse, les caractères de contrôle) ; la connexion revient à la page demandée (`?next=`).
- **Dépendances** : `pnpm audit --prod` sans vulnérabilité connue (versions corrigées imposées, vitest 4).
- **Accessibilité** : `e2e/a11y.spec.ts` (axe-core, WCAG 2.1 AA) sur connexion, inscription, tableau de bord, aperçu d'événement, page de vente, formulaire d'achat, billets et scanner, en thème clair et sombre ; couleurs d'état ajustées (contraste d'au moins 4,5:1, variantes pour le thème sombre).
- **Performances** : index ajoutés (plafond d'envoi, notifications, commandes par période et par contact, contacts consentants, réponses par billet) ; rendu des campagnes et automatisations chargé une fois par envoi ; page de vente : événement, contrôle d'accès et plan de salle chargés une seule fois par visite (métadonnées et page partagent le même chargement), sans aucun cache entre les visites (suspension, dernier billet vendu, revente et marque restent instantanés). Mesure locale sur la même page, 20 connexions : 22 → 32 pages par seconde, attente médiane 0,8 → 0,57 seconde.
- **Wallet** : badges officiels à déposer dans `apps/app/public/wallet/` (voir `LISEZMOI.md`), bouton texte sinon.

## Parrainage, espace participant et plan de salle

- **Parrainage** (section 9.22, `src/server/referrals.ts`, carte sur la page Abonnement) : lien `app.evoly.me/register?ref=…`, code mémorisé 30 jours à l'arrivée (proxy), organisation rattachée à sa création (jamais pour le même propriétaire). À la première vente payante de l'organisation parrainée : un mois de Pro au parrain, une seule fois (crédit de 29 € sur la facture Stripe si l'abonnement y est facturé, sinon 30 jours de Pro ajoutés), e-mail au propriétaire.
- **Espace participant** (section 9.23, `/mon-espace`, `src/server/participant.ts`) : sans compte ni mot de passe ; lien de connexion par e-mail (30 minutes, même réponse que l'adresse ait des billets ou non), session de 30 jours sur l'appareil. Billets à venir et passés de tous les organisateurs (rattachés par l'adresse), reventes, préférences d'e-mails par organisateur (désinscription, ou nouvel accord qui lève la seule désinscription, jamais un blocage pour rebond ou plainte). Lien depuis la page des billets.
- **Plan de salle** (section 9.9, Pro, `src/server/seating.ts`, onglet Billets) : catégories reliées aux tarifs, rangs aux places numérotées (« 12 » ou « 1, 2, 2 bis »), places bloquées d'un clic, compteurs par état ; placement numéroté activé seulement si chaque tarif a sa catégorie. Achat : meilleures places côte à côte attribuées d'office, ou choisies par l'acheteur sur le plan si l'organisateur le permet (revérifiées par le serveur : place prise ou nombre incorrect refusés). Places retenues avec le panier (RG-SEAT-01), attribuées aux billets au paiement, libérées à l'expiration ou à l'annulation, remises en vente au remboursement ; rang avec places vendues non supprimable, place vendue non modifiable (RG-SEAT-02), ce qui garantit qu'aucun changement du plan ne touche un acheteur (RG-SEAT-03). Place affichée sur la page des billets, le PDF, le pass Apple Wallet et le détail de la commande.

## Fiabilité et derniers écarts du cahier des charges

- **Renvoi des e-mails** (RG-ARC-06, `retryFailedEmails`, `GET /api/cron/emails` toutes les 5 minutes) : envoi immédiat ; en cas d'échec, contenu gardé (pièces jointes comprises) et renvoyé avec un délai doublé à chaque essai, 5 tentatives au plus ; contenu effacé une fois envoyé ou abandonné.
- **Modification simultanée** (RG-EVT-10) : la dernière sauvegarde des réglages l'emporte ; le membre dont l'enregistrement passe par-dessus celui d'un autre est averti.
- **Ventes par palier de prix** (RG-TKT-11) sur l'aperçu de l'événement ; **rappel au remboursement** que la commission et les frais de la vente d'origine ne sont pas restitués (RG-FEE-41).
- **Connexion Google et Apple** (US-AUTH-02) : boutons affichés si `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` ou `AUTH_APPLE_ID`/`AUTH_APPLE_SECRET` sont fournis ; comptes liés à un compte e-mail existant (RG-AUTH-04). **Limite de billets par adresse** (RG-BUY-09, réglages de l'événement). **Essai Pro après l'onboarding** pour une inscription venue de `?plan=pro` (RG-AUTH-08).
- **Traçabilité** : `docs/TRACABILITE.md` (état de chaque récit et règle du cahier des charges).
- **Points partiels terminés** : logos SVG vérifiés (ni script, ni référence externe) puis convertis en PNG (RG-FILE-01) ; PDF des billets en cache mémoire, indexés par l'empreinte de leur contenu (RG-FILE-02) ; plus aucune couleur codée en dur dans l'interface, couleurs de signal et noir ajoutés à la charte (RG-UI-02) ; réponses aux questions dans l'export des participants (RG-STAT-04) ; vérification quotidienne des certificats des domaines personnalisés, alerte à l'organisateur dans l'app et par e-mail (RG-CDM-02, `GET /api/cron/certificates`).
