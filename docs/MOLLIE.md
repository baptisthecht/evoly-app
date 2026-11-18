# Passage à Mollie

Stripe a refusé Evoly Solutions le 18 novembre 2026, après réexamen : la décision est définitive. Evoly passe à **Mollie
Connect pour plateformes**, sur le même modèle qu'avec Stripe :

- chaque organisateur encaisse sur **son propre compte Mollie**, relié à Evoly par OAuth ; Mollie le vérifie et y
  prélève ses frais ;
- Evoly prend sa **commission** sur chaque paiement, en frais d'application (`applicationFee`), versés par Mollie sur le
  solde d'Evoly ;
- le **compte Mollie d'Evoly** encaisse l'offre Pro.

Le portage se fait sur la branche `mollie`, partie de `main` (sans la boutique, portée ensuite), un commit par lot.

## Correspondances

| Besoin                   | Stripe (avant)                                                          | Mollie                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compte de l'organisateur | compte connecté (Accounts v2, tableau de bord complet, pertes à Stripe) | compte Mollie de l'organisateur, relié par OAuth                                                                                                              |
| Inscription              | lien d'inscription Stripe                                               | autorisation OAuth (création du compte ou connexion), puis profil de site et moyens de paiement créés par l'API                                               |
| État du compte           | `account.updated`, `charges_enabled`                                    | API Onboarding (`canReceivePayments`, `canReceiveSettlements`), relue régulièrement : Mollie n'envoie pas d'événement                                         |
| Paiement d'une commande  | PaymentIntent, formulaire intégré à la page                             | paiement Mollie sur le profil de l'organisateur, page de paiement de Mollie (redirection), commission en `applicationFee`                                     |
| Confirmation             | webhook signé `payment_intent.succeeded`, page de retour                | webhook Mollie (identifiant seul, état relu à l'API), page de retour                                                                                          |
| Remboursement            | `refunds.create`, commission gardée                                     | remboursement Mollie sur le solde de l'organisateur ; Mollie ne rend jamais la commission                                                                     |
| Revente                  | remboursement partiel du paiement d'origine du vendeur                  | idem                                                                                                                                                          |
| Virements                | `payouts`, `balance`                                                    | règlements (`settlements`) et solde (`balances`)                                                                                                              |
| Litiges                  | `charge.dispute.*`                                                      | rétrofacturations, signalées par le webhook du paiement                                                                                                       |
| Offre Pro                | Stripe Billing (Checkout, portail, factures)                            | client, mandat et abonnement Mollie sur le compte d'Evoly ; gestion de l'abonnement et factures dans Evoly                                                    |
| Apple Pay, Google Pay    | domaines de paiement déclarés sur chaque compte                         | rien à déclarer avec la page de paiement de Mollie (Apple Pay demande les cartes activées sur le profil)                                                      |
| Reversements aux lieux   | virements Stripe de la plateforme vers le compte du lieu                | à trancher au lot 5 : virement bancaire par Evoly, ou transferts entre soldes Connect (à activer par Mollie, accord de chaque lieu, 1 000 € par mois au plus) |

## Choix techniques

- **Client maison** (`apps/app/src/lib/mollie.ts`, sur `fetch`) plutôt qu'un SDK : l'ancien SDK (`@mollie/api-client`
  4.6.0) passe en maintenance, le nouveau (`mollie-api-typescript`) publie une version tous les quelques jours, ce qui
  heurte la règle des 14 jours, et Evoly n'appelle qu'une vingtaine de points d'API.
- **Jetons OAuth chiffrés en base** (AES-256-GCM, `apps/app/src/lib/seal.ts`, une clé par usage dérivée de
  `BETTER_AUTH_SECRET`). Le jeton d'accès vaut une heure : il est renouvelé 5 minutes avant son expiration. Le jeton de
  renouvellement n'expire pas ; refusé par Mollie (autorisation retirée), le compte est marqué à relier de nouveau.
- **Coexistence** : les champs Mollie s'ajoutent à ceux de Stripe, aucune donnée n'est perdue. Chaque commande garde
  son prestataire. Un organisateur relié à Mollie paie par Mollie ; Stripe ne sert plus qu'aux commandes déjà payées par
  lui, jusqu'à son retrait au dernier lot.
- **Page de paiement de Mollie** : cartes, Bancontact et Apple Pay sans déclaration de domaine. L'empreinte de la carte
  n'est connue qu'après le paiement : une carte bloquée est remboursée aussitôt, comme un paiement arrivé en retard.
  Les composants intégrés de Mollie pourront venir ensuite.
- **Webhooks classiques** (identifiant seul, état relu à l'API), recommandés par Mollie pour les paiements. Mollie
  relance 10 fois en 26 heures tant qu'Evoly ne répond pas 200 : la table des événements Stripe et sa relance ne sont
  pas reprises.
- **Mode test** : `MOLLIE_TESTMODE=true` relie les organisateurs en mode test ; chaque appel fait pour eux porte alors
  `testmode`. Le compte d'Evoly suit sa clé (`test_…` ou `live_…`).

## Lots

1. **Fondations** : client Mollie, chiffrement des jetons, compte Mollie de l'organisateur en base, variables
   d'environnement.
2. **Organisateurs** : relier son compte Mollie (OAuth), profil et moyens de paiement, état du compte et actions
   demandées, mention obligatoire de Mollie, déconnexion.
3. **Paiement des billets** : paiement Mollie avec la commission, webhook, page de retour, réservations, guichet (code
   QR), achat d'une revente.
4. **Remboursements et revente** : tous les remboursements, règlement du vendeur, annulation d'un événement,
   remboursements en attente de solde.
5. **Finances** : solde, règlements, rétrofacturations, frais réels, grille d'estimation Mollie, reversements aux lieux
   partenaires.
6. **Offre Pro** : abonnement Mollie (mensuel ou annuel, essai), gestion dans Evoly, factures.
7. **Bascule** : Mollie par défaut, textes légaux, documentation, retrait de Stripe.

Puis la boutique (branche `boutique`) passe à Mollie.

## Points à valider par le porteur

1. **Responsabilité** (conditions Connect, art. 7) : Evoly répond des remboursements que Mollie ne peut pas récupérer
   sur le solde de l'organisateur. Chez Stripe, les pertes étaient pour Stripe. À voir avec Mollie : règlements différés
   après l'événement pour la billetterie.
2. **Mention obligatoire** (art. 8) : avant d'inscrire un organisateur, et dans tout le marketing, indiquer que les
   services de paiement sont fournis par Mollie B.V. (Keizersgracht 126, 1015 CW Amsterdam, KvK 30204462, établissement
   de monnaie électronique et de paiement agréé et contrôlé par De Nederlandsche Bank, numéro F0038), avec le modèle de
   texte de Mollie s'il en fournit un.
3. **Commission jamais rendue par Mollie** : les deux cas où Evoly rend sa commission (commande impossible à servir,
   carte bloquée) passent en avoir sur le relevé mensuel de l'organisateur.
4. **Réserve** : Mollie peut retenir une réserve sur les comptes des organisateurs (billetterie, livraison différée).
5. **Particuliers et associations de fait** : à vérifier avec Mollie, qui ne les accepte peut-être pas.
6. **Tarifs à confirmer** : frais de remboursement (0,25 € selon des sites tiers), litiges, coût éventuel de Connect.

## À faire par le porteur

- **Application Connect** : Mollie › Développeurs › Vos applications › créer « Evoly », adresse de retour
  `https://app.evoly.me/api/mollie/oauth`. Pour le développement, une deuxième application avec
  `http://localhost:3001/api/mollie/oauth`, si Mollie accepte une adresse locale.
- **Clés**, dans le `.env` (jamais dans une conversation) : `MOLLIE_API_KEY` (`test_…` en développement, `live_…` en
  production), `MOLLIE_CLIENT_ID`, `MOLLIE_CLIENT_SECRET`.
- **Un deuxième compte Mollie, de test**, pour jouer l'organisateur : Mollie refuse les frais d'application sur
  l'organisation propriétaire de l'application.
