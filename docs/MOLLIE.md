# Paiements avec Mollie

Evoly encaisse avec **Mollie Connect pour plateformes** :

- chaque organisateur encaisse sur **son propre compte Mollie**, relié à Evoly par OAuth ; Mollie le vérifie et y
  prélève ses frais ;
- Evoly prend sa **commission** sur chaque paiement, en frais d'application (`applicationFee`), versés par Mollie sur le
  solde d'Evoly ;
- le **compte Mollie d'Evoly** encaisse l'offre Pro.

Mollie est le seul prestataire de paiement d'Evoly (voir « Historique » en fin de document). Le portage s'est fait sur
la branche `mollie`, partie de `main`, un commit par lot ; la boutique (branche `boutique`) passe ensuite à Mollie.

## Choix techniques

- **Client maison** (`apps/app/src/lib/mollie.ts`, sur `fetch`) plutôt qu'un SDK : l'ancien SDK (`@mollie/api-client`
  4.6.0) passe en maintenance, le nouveau (`mollie-api-typescript`) publie une version tous les quelques jours, ce qui
  heurte la règle des 14 jours, et Evoly n'appelle qu'une vingtaine de points d'API.
- **Jetons OAuth chiffrés en base** (AES-256-GCM, `apps/app/src/lib/seal.ts`, une clé par usage dérivée de
  `BETTER_AUTH_SECRET`). Le jeton d'accès vaut une heure : il est renouvelé 5 minutes avant son expiration. Le jeton de
  renouvellement n'expire pas ; refusé par Mollie (autorisation retirée), le compte est marqué à relier de nouveau.
- **Page de paiement de Mollie** : cartes, Bancontact et Apple Pay sans déclaration de domaine. L'empreinte de la carte
  n'est connue qu'après le paiement : une carte bloquée est remboursée aussitôt, comme un paiement arrivé en retard.
  Les composants intégrés de Mollie pourront venir ensuite.
- **Webhooks classiques** (identifiant seul, état relu à l'API), recommandés par Mollie pour les paiements. Mollie
  relance 10 fois en 26 heures tant qu'Evoly ne répond pas 200 : Evoly ne garde ni journal des événements reçus ni file
  de relance.
- **Mode test** : `MOLLIE_TESTMODE=true` relie les organisateurs en mode test ; chaque appel fait pour eux porte alors
  `testmode`. Le compte d'Evoly suit sa clé (`test_…` ou `live_…`).

## Paiement des billets par Mollie (lot 3)

- **Compte qui encaisse** : le compte Mollie de l'organisateur, dès qu'il est prêt (`mollieReady`) ; sans compte prêt,
  aucune vente payante (publication, tarifs payants, revente). Chaque commande payée en ligne garde son paiement Mollie
  (`Order.molliePaymentId`).
- **Parcours** : coordonnées de l'acheteur, puis la page de paiement de Mollie (cartes, Bancontact, Apple Pay), retour
  sur la page des billets du site visité. Un paiement encore ouvert est repris ; annulé, expiré ou refusé, un nouveau
  est créé, et la page des billets propose de réessayer tant que les places sont réservées.
- **Réservation** : prolongée à 15 minutes au départ vers Mollie (durée d'un paiement par carte chez Mollie). Un
  paiement arrivé plus tard est honoré s'il reste des places, sinon remboursé en entier.
- **Validation** : au retour de l'acheteur et par le webhook (`/api/webhooks/mollie`, adresse donnée à chaque paiement,
  rien à configurer chez Mollie ; absente en local, où seul le retour de l'acheteur valide la commande), toujours après
  relecture du paiement chez Mollie, montant et devise vérifiés.
- **Commission** : transmise en frais d'application, ramenée au plafond de Mollie (montant moins 0,35 et 6 %) sur une
  très petite commande. Mollie ne la rend jamais : pour un paiement tardif sans place ou une carte bloquée, elle doit
  revenir à l'organisateur, en avoir sur son relevé mensuel (point à valider n° 3) ; ce n'est pas encore fait (la
  commande n'entre simplement pas dans le relevé).
- **Carte de l'acheteur** : son empreinte n'est connue qu'après le paiement. Une carte bloquée par l'organisation est
  donc remboursée aussitôt après, sans billet ; les limites par acheteur se vérifient par l'adresse e-mail avant le
  paiement, et l'empreinte est gardée pour les commandes suivantes.

## Remboursements et revente par Mollie (lot 4)

- **Remboursements** (demande de l'acheteur, organisateur, annulation d'un événement, options) : sur le paiement Mollie
  de la commande, pris sur le solde de l'organisateur. La commission d'Evoly n'est pas rendue. L'état suit le webhook
  du paiement ; un remboursement en attente d'un solde suffisant chez Mollie reste « en cours ». Sans paiement Mollie,
  le remboursement échoue (« paiement en ligne introuvable »), sauf une vente sur place en espèces, remboursée en
  espèces hors d'Evoly.
- **Revente** : le vendeur est remboursé sur son paiement Mollie d'origine, moins la commission, les frais du paiement
  de l'acheteur et les frais du remboursement (0,25 €, à confirmer avec Mollie) : l'organisateur reste neutre
  (RG-FEE-51).
- **Frais estimés** d'après la grille Mollie relevée le 18 novembre 2026, tant que les frais réels manquent (lot 5).
- **Moyens non remboursables** : cartes cadeaux, bons et paysafecard ; une place payée ainsi ne se revend pas.

## Finances avec Mollie (lot 5)

- **Solde et versements** lus chez Mollie (solde disponible et en attente, dix derniers versements), jamais déclenchés
  par Evoly (RG-FIN-01). Mollie indisponible ou compte à relier : la page le dit, sans rien inventer.
- **Rétrofacturations** : signalées par le webhook du paiement, copiées comme litiges et rattachées à la commande ;
  chaque nouvelle prévient l'organisateur (et par e-mail) ; annulée par Mollie, elle passe « gagnée ». La réponse se
  fait dans Mollie.
- **Versement échoué** vers la banque de l'organisateur : signalé une seule fois par la tâche horaire.
- **Frais estimés** d'après la grille Mollie (aide au prix des tarifs, totaux des Finances, remboursements « moins les
  frais », revente) ; les frais réels de chaque paiement (transactions du solde Mollie) restent à brancher.
- **Reversements aux lieux partenaires** : en pause (décision du 18 novembre 2026), en attendant la réponse de Mollie
  sur les transferts entre soldes Connect (à faire activer par Mollie, avec l'accord de chaque lieu et 1 000 € par
  mois au plus) ; autre voie possible : un virement bancaire par Evoly. D'ici là, rien n'est versé, ni chaque mois ni à
  la demande (plus de bouton « Verser maintenant ») : la part reste due au lieu et s'affiche comme reversement à venir.

## Offre Pro payée par Mollie (lot 6)

- **Compte d'Evoly** (`MOLLIE_API_KEY`) : un client Mollie par organisation, créé au premier paiement. Evoly tient les
  périodes et prélève lui-même chaque renouvellement sur le mandat (paiements « récurrents »), plutôt que l'API des
  abonnements de Mollie : passage au mensuel ou à l'annuel, résiliation, nouvelles tentatives et dates restent dans
  Evoly, sans écart avec Mollie.
- **Essai** de 14 jours sans carte, une fois par organisation (ni après un abonnement payé). À sa fin, sans abonnement,
  retour en Free sans rien perdre ; prévenu 3 jours avant, comme un Pro offert.
- **Premier paiement** sur la page de Mollie (carte, Bancontact, et les autres moyens qui créent un mandat) : sans
  période en cours, il paie la première période, qui commence tout de suite, et crée le mandat des renouvellements
  (carte, ou prélèvement SEPA après Bancontact). Validé au retour sur la page Abonnement et par le webhook
  `/api/webhooks/mollie/pro`.
- **Abonnement pris pendant une période en cours** (essai, Pro offert, offre de lancement) : rien à payer avant sa fin.
  La page de Mollie demande seulement un paiement de vérification de 0,02 € (le minimum de Bancontact chez Mollie ;
  carte 0 €, Belfius et Pay by Bank 0,01 €), qui crée le mandat et est remboursé aussitôt (repris par la tâche horaire
  si Mollie ne répond pas). Il n'est jamais facturé. La période en cours va jusqu'au premier prélèvement, fait la
  veille de sa fin comme un renouvellement ; un e-mail confirme la date et le montant, un rappel part 7 jours avant.
  Payée après la fin de la période, la vérification déclenche le premier prélèvement tout de suite.
- **Renouvellement** prélevé au plus tôt la veille de l'échéance par la tâche horaire, à la périodicité choisie pour la
  suite (sans prorata). Échec : impayé, propriétaire prévenu à chaque échec, nouvelle tentative 3 jours puis 6 jours
  après ; au bout de 7 jours sans paiement, l'abonnement prend fin (retour en Free, rien n'est supprimé).
  L'organisateur peut régler la période impayée sur la page de Mollie, avec un nouveau moyen de paiement.
- **Préavis du prélèvement** : la facture de chaque paiement annonce la date et le montant du suivant ; un rappel part
  7 jours avant un renouvellement annuel, un changement de périodicité ou le premier prélèvement à la fin d'une
  période en cours.
- **Changer de moyen de paiement** : carte enregistrée sur la page de Mollie sans paiement (0 €, seulement pour une
  carte chez Mollie). **Résilier** : plus aucun prélèvement, Pro jusqu'à l'échéance ; reprise possible d'ici là.
- **Factures** émises par Evoly à chaque paiement reçu : numéro de la série sans trou des relevés de commissions
  (EVO-année-numéro), TVA de la commission (RG-FEE-30), client figé au jour de l'émission, PDF dans la langue de
  l'organisation, joint à l'e-mail et téléchargeable depuis la page Abonnement. Paiement contesté : la période
  redevient due ; l'avoir reste à faire à la main.
- **Administration** : prolonger l'essai d'un abonné Mollie recule son prochain prélèvement ; lui attribuer une autre
  offre exige de cocher la résiliation (Evoly cesse de prélever). Un parrainage recule aussi le prochain prélèvement
  d'un mois.

## Boutique payée par Mollie (lot 8)

- **Compte de l'organisateur** : les commandes de la boutique (section 9.35 du CDC) sont payées sur son compte Mollie,
  comme les billets, mais sans frais d'application : aucune commission Evoly (RG-SHOP-08). Le paiement porte la
  commande dans ses métadonnées (`ShopOrder.molliePaymentId`).
- **Parcours** : coordonnées et mode de remise, puis la page de paiement de Mollie, retour sur la page de la commande
  du site visité ; un paiement encore ouvert au même montant est repris, sinon un nouveau est créé (Mollie ne change
  pas le montant d'un paiement : changer de mode de remise en crée un autre). Annulé, expiré ou refusé : la page
  propose de réessayer tant que les produits sont réservés ; en cours de traitement, elle se met à jour toute seule.
- **Réservation** : prolongée à 15 minutes au départ vers Mollie ; un paiement arrivé plus tard est servi si le stock le
  permet, sinon remboursé en entier.
- **Validation** : au retour de l'acheteur et par le webhook `/api/webhooks/mollie/boutique?commande=…` (adresse
  donnée à chaque paiement, absente en local), toujours après relecture du paiement chez Mollie avec le jeton de
  l'organisateur, montant, devise et commande vérifiés.
- **Paiement sans commande à servir** : réservation annulée pendant le paiement, ou paiement remplacé par un autre et
  payé malgré tout (autre onglet) : remboursé en entier, une seule fois (montant déjà remboursé relu chez Mollie, clé
  d'idempotence par paiement). Une carte bloquée, connue au paiement seulement, est aussi remboursée.
- **Remboursements** : par l'organisateur, ligne par ligne, sur le paiement Mollie, pris sur son solde ; l'état final
  (remboursé, échoué) est relu sur le paiement quand Mollie appelle le webhook.
- **Frais** : Mollie ne les donne pas paiement par paiement ; la fiche d'une commande montre les frais estimés d'après
  la grille de Mollie (carte ou Bancontact), les frais réels figurent sur les relevés Mollie de l'organisateur.

## Lots

Tous faits (19 novembre 2026, boutique le 21 novembre) :

1. **Fondations** : client Mollie, chiffrement des jetons, compte Mollie de l'organisateur en base, variables
   d'environnement.
2. **Organisateurs** : relier son compte Mollie (OAuth), profil et moyens de paiement, état du compte et actions
   demandées, mention obligatoire de Mollie, déconnexion.
3. **Paiement des billets** : paiement Mollie avec la commission, webhook, page de retour, réservations, guichet (code
   QR), achat d'une revente.
4. **Remboursements et revente** : tous les remboursements, règlement du vendeur, annulation d'un événement,
   remboursements en attente de solde.
5. **Finances** : solde, règlements, rétrofacturations, grille d'estimation Mollie ; frais réels encore à brancher,
   reversements aux lieux partenaires en pause.
6. **Offre Pro** : abonnement Mollie (mensuel ou annuel, essai), gestion dans Evoly, factures ; abonnement pris pendant
   une période en cours sans paiement immédiat.
7. **Bascule** : Mollie seul prestataire, textes légaux, site vitrine, documentation, tests ; retrait de l'ancien
   prestataire, sans rétrocompatibilité (voir « Historique »).
8. **Boutique** : paiement des commandes de la boutique sur le compte Mollie de l'organisateur, sans commission,
   webhook dédié, remboursements ; migrations de la boutique regroupées après celles de Mollie
   (`20261121120000_boutique`, `20261121120100_boutique_offres`).

## Points à valider par le porteur

1. **Responsabilité** (conditions Connect, art. 7) : Evoly répond des remboursements que Mollie ne peut pas récupérer
   sur le solde de l'organisateur. À voir avec Mollie : règlements différés après l'événement pour la billetterie.
2. **Mention obligatoire** (art. 8) : avant d'inscrire un organisateur, et dans tout le marketing, indiquer que les
   services de paiement sont fournis par Mollie B.V. (Keizersgracht 126, 1015 CW Amsterdam, KvK 30204462, établissement
   de monnaie électronique et de paiement agréé et contrôlé par De Nederlandsche Bank, numéro F0038), avec le modèle de
   texte de Mollie s'il en fournit un.
3. **Commission jamais rendue par Mollie** : les deux cas où Evoly rend sa commission (commande impossible à servir,
   carte bloquée) passent en avoir sur le relevé mensuel de l'organisateur.
4. **Réserve** : Mollie peut retenir une réserve sur les comptes des organisateurs (billetterie, livraison différée).
5. **Particuliers et associations de fait** : à vérifier avec Mollie, qui ne les accepte peut-être pas.
6. **Tarifs à confirmer** : frais de remboursement (0,25 € selon des sites tiers), litiges, coût éventuel de Connect.
7. **Reversements aux lieux partenaires** : transferts entre soldes Connect (réponse de Mollie attendue) ou virement
   bancaire par Evoly.

## À faire par le porteur

- **Application Connect** : Mollie › Développeurs › Vos applications › créer « Evoly », adresse de retour
  `https://app.evoly.me/api/mollie/oauth`. Pour le développement, une deuxième application avec
  `http://localhost:3001/api/mollie/oauth`, si Mollie accepte une adresse locale.
- **Clés**, dans le `.env` (jamais dans une conversation) : `MOLLIE_API_KEY` (`test_…` en développement, `live_…` en
  production), `MOLLIE_CLIENT_ID`, `MOLLIE_CLIENT_SECRET`.
- **Un deuxième compte Mollie, de test**, pour jouer l'organisateur : Mollie refuse les frais d'application sur
  l'organisation propriétaire de l'application.

## Historique

Evoly encaissait d'abord avec Stripe (Connect pour les comptes des organisateurs, Billing pour l'offre Pro). Stripe a
refusé Evoly Solutions le 18 novembre 2026, après réexamen, de façon définitive : Evoly est passé à Mollie Connect pour
plateformes, sur le même modèle, en sept lots. Aucun organisateur n'avait relié Stripe : le lot 7 l'a retiré du code, de
la base (migration `20261119100000_mollie_retrait_stripe`), des textes, du site et des tests, sans rétrocompatibilité.

| Besoin                   | Stripe (avant)                                                          | Mollie                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Compte de l'organisateur | compte connecté (Accounts v2, tableau de bord complet, pertes à Stripe) | compte Mollie de l'organisateur, relié par OAuth                                                                                   |
| Inscription              | lien d'inscription Stripe                                               | autorisation OAuth (création du compte ou connexion), puis profil de site et moyens de paiement créés par l'API                    |
| État du compte           | `account.updated`, `charges_enabled`                                    | API Onboarding (`canReceivePayments`, `canReceiveSettlements`), relue régulièrement : Mollie n'envoie pas d'événement              |
| Paiement d'une commande  | PaymentIntent, formulaire intégré à la page                             | paiement Mollie sur le profil de l'organisateur, page de paiement de Mollie (redirection), commission en `applicationFee`          |
| Confirmation             | webhook signé `payment_intent.succeeded`, page de retour                | webhook Mollie (identifiant seul, état relu à l'API), page de retour                                                               |
| Remboursement            | `refunds.create`, commission gardée                                     | remboursement Mollie sur le solde de l'organisateur ; Mollie ne rend jamais la commission                                          |
| Revente                  | remboursement partiel du paiement d'origine du vendeur                  | idem                                                                                                                               |
| Virements                | `payouts`, `balance`                                                    | règlements (`settlements`) et solde (`balances`)                                                                                   |
| Litiges                  | `charge.dispute.*`                                                      | rétrofacturations, signalées par le webhook du paiement                                                                            |
| Offre Pro                | Stripe Billing (Checkout, portail, factures)                            | client et mandat Mollie sur le compte d'Evoly, renouvellements prélevés par Evoly ; gestion de l'abonnement et factures dans Evoly |
| Apple Pay, Google Pay    | domaines de paiement déclarés sur chaque compte                         | rien à déclarer avec la page de paiement de Mollie (Apple Pay demande les cartes activées sur le profil)                           |
| Reversements aux lieux   | virements Stripe de la plateforme vers le compte du lieu                | en pause depuis le 18 novembre 2026 : transferts entre soldes Connect (réponse de Mollie attendue) ou virement bancaire par Evoly  |
