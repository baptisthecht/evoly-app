# À faire

Points en attente, par ordre d'urgence. Les tests restants à écrire sont listés à part dans `test.md`.

## Production

- **Redéployer** (`ops/deploy.sh`, sans migration) pour mettre en ligne ce qui a suivi le déploiement du 21 octobre :
  réglages d'un événement en deux colonnes avec une icône par champ, bandes d'en-tête alignées sur le contenu.
- Google Ads : sous 48 heures, les conversions « Organisation créée » (principale) et « Inscription » (secondaire)
  doivent passer de « Inactive » à l'enregistrement ; dans deux ou trois semaines, rapport « Performances des éléments »
  de l'annonce (remplacer les titres classés « Faible ») ; le 31 mars 2027, fin de l'offre de lancement : retirer le
  titre « 3 mois de Pro offerts ».

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
