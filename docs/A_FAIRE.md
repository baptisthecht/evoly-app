# À faire

Points en attente, par ordre d'urgence. Les tests restants à écrire sont listés à part dans `test.md`.

## Avant le prochain déploiement

- **Relancer les parcours complets** (`ops/e2e.sh` ou la CI) : ils n'ont pas tourné depuis l'ajout du bandeau des cookies
  (`apps/app/src/components/tracking`) et de l'offre de lancement. Le bandeau, fixé en bas de l'écran, peut masquer des
  boutons : poser le choix des cookies dans la fonction commune des parcours (`apps/app/e2e/fixtures.ts`) si besoin.
- **Déployer** : application (avec la migration `20261020120000_acquisition`) et site vitrine reconstruit.
- **Google Ads** : inscrire l'identifiant `AW-…` et les libellés des conversions « Inscription » et « Organisation
  créée » (`EVOLY_IDS` dans `apps/app/src/components/tracking/Analytics.tsx`), voir `docs/TRACKING.md`.

## Offres commerciales

Fait : gérées en base et dans l'administration (`docs/OFFRES.md`). Reste à faire : un parcours complet de
l'administration des offres, de la création d'une offre à son attribution.

## Décisions prises

- Avertissement de fin d'un Pro offert : 3 jours avant (comme les essais Stripe).
- Pas d'offre pour les organisations créées avant sa mise en ligne (il n'y en a pas).

## Création rapide pour les visiteurs des annonces (`/start`)

En place : l'événement d'abord (nom, date, lieu, ville, prix, places), puis le compte (organisation, e-mail, mot de
passe) avec l'aperçu de l'événement ; compte, organisation et événement en brouillon créés d'un coup, le lien de
vérification mène au tableau de bord. À faire :

- Faire pointer les boutons du site vitrine (« Créer mon premier événement ») et l'URL finale des annonces vers
  `https://app.evoly.me/start`, après déploiement et essai.
- Un parcours complet (Playwright) de `/start` jusqu'au tableau de bord après vérification de l'adresse.
- Afficher sur la page de vérification de l'adresse que l'événement est enregistré et attend d'être publié.

## Mesure

- Couverture des parcours : le paiement sur place (`PayAtVenue.tsx`) et l'import de prospects (`UploadForm.tsx`) sont
  testés mais absents de la mesure (scripts sans carte de correspondance, à vérifier) ; le parcours de la caméra du
  scanner lance son propre navigateur et n'est pas mesuré.
