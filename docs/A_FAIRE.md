# À faire

Points en attente, par ordre d'urgence. Les tests restants à écrire sont listés à part dans `test.md`.

## Production

- **Redéployer** (`ops/deploy.sh`) : les migrations s'appliquent d'elles-mêmes (vitrine de l'organisateur, limites
  d'achat, empreinte de la carte). Le déploiement met aussi en ligne ce qui a suivi celui du 21 octobre.
- Google Ads : sous 48 heures, les conversions « Organisation créée » (principale) et « Inscription » (secondaire)
  doivent passer de « Inactive » à l'enregistrement ; dans deux ou trois semaines, rapport « Performances des éléments »
  de l'annonce (remplacer les titres classés « Faible ») ; le 31 mars 2027, fin de l'offre de lancement : retirer le
  titre « 3 mois de Pro offerts ».

## Refonte du tableau de bord

Arborescence, règles d'interface et ordre de mise en œuvre décidés le 28 octobre 2026 : voir `docs/ARBORESCENCE.md`.

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

- Arrêter les tâches planifiées de l'ancienne installation (adresse 51.75.16.245), qui appellent toutes les 5 minutes des adresses qui n'existent plus et exposent un secret dans les journaux de Caddy.
- Vérifier que ce secret n'est plus celui d'Evoly (`grep -c 'o5pwJ' .env` doit afficher 0), sinon le changer.
- Libérer de la place sur le disque du serveur (79 % le 26 octobre 2026) : `docker image prune -f` et `docker builder prune -f --filter until=72h`.

## Prospection

- Traiter les zips des réponses des prospects (positives, négatives, non livrées) et produire le CSV pour l'import des réponses de l'administration.

## Comptes et marque

- Vérification de la marque Google : « J'ai corrigé les problèmes », puis « Demander une nouvelle validation ».
- Connexion par Apple : compte Apple Developer requis (99 $ par an).
- Supprimer l'import d'essai du Loto dans « Réseaux de vente », « Historique des imports ».

## Parcours complets encore absents (voir `test.md`)

- Paiements Stripe de bout en bout en mode test : panier payant, 3-D Secure, refus de la carte, paiement sur place par
  carte, remboursement réel, webhooks, souscription Pro (Checkout et portail), ouverture d'un compte Stripe Connect.
  Demande des clés Stripe de test dans les secrets de la CI.
- Ambassadeurs (vente par le lien d'un ambassadeur, classement) et prévente (code, code épuisé, lien `?prevente=CODE`).

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
