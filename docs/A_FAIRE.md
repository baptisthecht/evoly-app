# À faire

Points en attente, par ordre d'urgence. Les tests restants à écrire sont listés à part dans `test.md`.

## Production

- Google Ads : sous 48 heures, les conversions « Organisation créée » (principale) et « Inscription » (secondaire)
  doivent passer de « Inactive » à l'enregistrement ; dans deux ou trois semaines, rapport « Performances des éléments »
  de l'annonce (remplacer les titres classés « Faible ») ; le 31 mars 2027, fin de l'offre de lancement : retirer le
  titre « 3 mois de Pro offerts ».

## Lots de novembre (décidés le 16 novembre 2026)

- Lot 1, bloquer une personne : fait. Onglet « Personnes bloquées » des commandes, « Bloquer cet acheteur » sur la
  fiche d'une commande, adresse et carte refusées avant le débit (revente et liste d'attente comprises), nom identique
  signalé (pastille « Signalé », notification). Au prochain déploiement : migration `20261116120000_personnes_bloquees`.
- Lot 2, remboursement à coût neutre : fait. Réglage par événement (« Remboursement intégral » ou « moins les
  frais »), valeur par défaut dans Paramètres, Paiements, figé sur la commande ; règle affichée sur la page de
  l'événement, dans le tunnel d'achat et l'e-mail de confirmation ; montant exact dans la demande. Au prochain
  déploiement : migration `20261116130000_remboursement_cout_neutre`.
- Lot 3, la boutique (sous-lots 3a à 3d), sur la branche `boutique` (décidé le 17 novembre 2026), modèle de données
  validé par le fondateur le 17 novembre 2026 :
  - 3a, catalogue et écrans d'administration : fait. Entrée « Boutique » (Pro) avec les onglets Produits et Retrait et
    livraison ; fiche d'un produit (statut, informations, photos, options, stock et supplément de chaque variante) ;
    droit « Gérer la boutique ». Au déploiement : migrations `20261117120000_boutique` et
    `20261117120100_boutique_offres`.
  - 3b, boutique publique avec retrait en main propre, paiement, e-mails, code QR de retrait : fait. Section
    « Boutique » sur la page de l'organisation, page produit, panier, paiement sans commission Evoly, page de la commande
    (code QR, reçu avec la TVA, rétractation de 14 jours, ouverte aussi au retrait sur place), onglet Commandes, fiche
    d'une commande (prête, remise, remboursement), scan des retraits ; conditions de vente complétées. Au déploiement :
    migration `20261117140000_boutique_commandes`. Plus tard : les commandes de la boutique dans Finances (recette,
    exports), qui ne comptent aujourd'hui que les billets.
  - 3c, produits en option des événements, stock partagé : fait. Billetterie, Options : « Produit de la boutique » ;
    l'acheteur choisit la variante avec ses billets, retenue sur le stock de la boutique, retirée à l'événement. Au
    déploiement : migration `20261117150000_boutique_options_evenements`.
  - 3d, livraison avec numéro de suivi : fait. Au paiement, retrait ou livraison (mode, adresse, frais ajoutés au total
    avec leur TVA) ; fiche d'une commande livrée : adresse, « Marquer expédiée » avec le transporteur, le numéro et le
    lien de suivi (e-mail à l'acheteur), livraison remboursable une fois ; rétractation ouverte jusqu'à 14 jours après
    la livraison estimée (expédition plus 7 jours). Au déploiement : migration `20261117160000_boutique_livraison`.
- Lot 4, connexion avec Apple : fait côté code (origine de confiance `https://appleid.apple.com`, script du secret,
  procédure dans `docs/DEPLOIEMENT.md`) ; reste la configuration chez Apple et sur le serveur (ci-dessous).

## Refonte du tableau de bord

Arborescence, règles d'interface et ordre de mise en œuvre décidés le 28 octobre 2026 : voir `docs/ARBORESCENCE.md`.

- Fait : le socle (tableau, fenêtre, onglets en boutons, pastille), l'arborescence de l'événement puis de
  l'organisation, les tableaux page par page et l'accueil vivant, avec la refonte A3 de toutes les pages et du
  téléphone (6 et 7 novembre 2026, maquettes `UIUX/`, consignes dans `docs/INTERFACE.md`).
- L'archivage d'un événement n'existe pas encore : à créer pour Réglages, Avancé.

## Limites d'achat, lot 4 : compte acheteur obligatoire

Décidé le 27 octobre 2026 (les lots 1 à 3 sont en ligne : limites par acheteur, par tarif et en prévente, code promo de groupe, adresse normalisée, empreinte de la carte).

- Option par événement, réservée aux événements très demandés : « Compte obligatoire pour acheter ».
- Il n'existe pas encore de compte acheteur : à créer (connexion par lien magique envoyé par e-mail, sans mot de passe), distinct des comptes des organisateurs.
- Les limites par acheteur se comptent alors aussi par compte, en plus de l'adresse normalisée et de l'empreinte de la carte.
- Le compte rattache les commandes passées avec la même adresse normalisée.
- À trancher : place du compte dans le parcours d'achat (avant le choix des billets ou au paiement), et ce que le compte affiche (billets, revente, factures).

## Stripe en mode réel

- Fait le 28 octobre 2026 : compte de la plateforme activé (cartes, Bancontact, Link, transferts actifs ; Cartes Bancaires
  en cours d'activation par Stripe), « Connecter mon compte Stripe » fonctionne. Diagnostic : `ops/stripe-status.sh`.
- Après l'inscription Stripe d'un organisateur : vérifier la livraison de `account.updated` (réponse 200) sur la
  destination « comptes connectés », et « Paiements activés » dans Evoly.
- Compléter le profil Stripe (Paramètres, Entreprise) : description de l'activité (vide), un seul e-mail de support
  (`contact@` dans Stripe, `hello@` sur le site), adresse de support.
- Ne jamais tester en mode réel avec sa propre carte : les conditions de Stripe l'interdisent. Un achat de test remboursé
  laisse aussi un solde négatif (-0,30 € de frais conservés le 28 octobre 2026). Les essais se font en mode test ; en mode
  réel, surveiller les premières vraies ventes et les livraisons des deux webhooks (réponse 200).
- Régler un solde minimum dans les virements, pour couvrir les remboursements d'abonnements Pro sans solde négatif.
- Plus tard : remplacer la clé secrète à accès complet par une clé restreinte aux opérations qu'Evoly appelle (liste établie le 26 octobre 2026), après un essai complet.

## Sécurité et exploitation

- Renouvellements Apple : le secret de la connexion avec Apple (`AUTH_APPLE_SECRET`) expire 180 jours après sa
  génération (date affichée par `ops/apple-client-secret.mjs`, à noter ici à chaque génération) ; le certificat Apple
  Wallet (`APPLE_PASS_CERT_PEM`) expire au bout d'un an (`openssl x509 -enddate -noout -in pass.pem`). Les renouveler
  un mois avant, puis `ops/deploy.sh`.
- picomatch : dès qu'une version corrige l'avis GHSA-fc5q-39xc-vjpf et a 14 jours, l'installer (dépendance indirecte,
  `pnpm-lock.yaml`) et retirer son exclusion de `pnpm audit` (`package.json`, `docs/SECURITE.md`).
- Arrêter les tâches planifiées de l'ancienne installation (adresse 51.75.16.245), qui appellent toutes les 5 minutes des adresses qui n'existent plus et exposent un secret dans les journaux de Caddy.
- Vérifier que ce secret n'est plus celui d'Evoly (`grep -c 'o5pwJ' .env` doit afficher 0), sinon le changer.
- Libérer de la place sur le disque du serveur (79 % le 26 octobre 2026) : `docker image prune -f` et `docker builder prune -f --filter until=72h`.

## Prospection

- Traiter les zips des réponses des prospects (positives, négatives, non livrées) et produire le CSV pour l'import des réponses de l'administration.

## Comptes et marque

- Vérification de la marque Google : « J'ai corrigé les problèmes », puis « Demander une nouvelle validation ».
- Connexion avec Apple : à configurer (`docs/DEPLOIEMENT.md`, « Connexion avec Apple ») : App ID, Services ID, clé
  .p8, secret généré par `ops/apple-client-secret.mjs`, domaine `evoly.me` et adresse `no-reply@evoly.me` déclarés
  pour les adresses masquées.
- Supprimer l'import d'essai du Loto dans « Réseaux de vente », « Historique des imports ».

## Parcours complets encore absents (voir `test.md`)

- Paiements Stripe de bout en bout en mode test : panier payant, 3-D Secure, refus de la carte, paiement sur place par
  carte, remboursement réel, webhooks, souscription Pro (Checkout et portail), ouverture d'un compte Stripe Connect.
  Demande des clés Stripe de test dans les secrets de la CI.
- Ambassadeurs (vente par le lien d'un ambassadeur, classement) et prévente (code, code épuisé, lien `?prevente=CODE`).

## Déjà fait (novembre 2026)

Déploiement du 7 novembre : refonte A3 du tableau de bord et du téléphone ; vitrine de l'organisateur, limites d'achat
et empreinte de la carte (migrations) ; node-forge 1.4.2, plus aucune faille connue dans les dépendances ; boutons et
formulaires sûrs avant le chargement du JavaScript (« Ouvrir le scanner », « Connecter mon compte Stripe », connexion
avec Google ou Apple, « Retrouver mes billets », « Prévenez-moi »). Vérifié en ligne : santé, pages de l'app, du
scanner et du site vitrine, règle de sécurité des formulaires, tâches planifiées fermées sans leur secret.

## Déjà fait (octobre 2026)

Déploiement du 21 octobre (migrations, site vitrine, Geoapify, Google Ads et annonces vers `/start`) ; thème pro et
revue visuelle des écrans ; en-têtes et onglets uniformes ; offres commerciales en base et leur parcours complet ;
création rapide `/start`, son parcours complet et le rappel de l'événement sur la page de vérification ; page d'une
commande en onglets ; réglages d'un événement en deux colonnes.

## Décisions prises

- Avertissement de fin d'un Pro offert : 3 jours avant (comme les essais Stripe).
- Pas d'offre pour les organisations créées avant sa mise en ligne (il n'y en a pas).

## Mesure

- Couverture des parcours : le paiement sur place (`PayAtVenue.tsx`) et l'import de prospects (`UploadForm.tsx`) sont
  testés mais absents de la mesure (scripts sans carte de correspondance, à vérifier) ; le parcours de la caméra du
  scanner lance son propre navigateur et n'est pas mesuré.
