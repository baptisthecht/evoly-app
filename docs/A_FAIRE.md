# À faire

Points en attente, par ordre d'urgence. Les tests restants à écrire sont listés à part dans `test.md`.

## Prochain déploiement (état au 20 octobre 2026, soir)

- CI officielle au vert depuis `fc52049` (tests unitaires, planchers de couverture et parcours complets).
- Migrations de cette période, appliquées par `prisma migrate deploy` : `20261020120000_acquisition`,
  `20261021090000_promotions` (offre de lancement incluse), `20261022090000_page_views` (visites des billetteries),
  `20261022100000_brand_theme` (personnalisation de la marque), `20261022110000_event_theme` (style d'un événement).
- À renseigner en production : `GEOAPIFY_API_KEY` (recherche de lieux rapide ; sans elle, Photon répond en 5 à 7 s),
  identifiant Google Ads `AW-…` et libellés des conversions (`EVOLY_IDS` dans `Analytics.tsx`).
- Construire et publier le site vitrine (`apps/web/build.py`) avec l'application.
- Restent à faire : polices de la marque sur les billets PDF (couleurs et logo déjà présents), revue sur téléphone
  des nouveaux écrans (barre latérale, en-tête de l'événement, vue d'ensemble, Marque, Apparence), faire pointer les
  boutons du site et les annonces vers `/start`.

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

## Thème pro de l'application (maquette validée le 21 octobre 2026)

Fait : jetons et composants (boutons, champs, libellés, pastilles, cartes) du thème pro, actif sur les pages de
l'application des organisateurs (repère `.theme-pro`) ; la billetterie publique, l'espace des acheteurs et le scanner
gardent la charte. Création rapide (`/start`) refaite selon la maquette. Reste à faire :

- Fait : recherche d'adresse (Photon, via `/api/places`, cache d'un jour, 60 recherches par minute et par IP) sur
  `/start` et dans le formulaire d'événement. Le serveur public de Photon répond en 5 à 7 secondes : créer un compte Geoapify (gratuit jusqu'à
  3 000 recherches par jour) et renseigner `GEOAPIFY_API_KEY` en production, utilisé alors automatiquement.
- Fait : onglets horizontaux en haut de chaque événement (six parties, pages de la partie active en seconde rangée,
  « Partager le lien ») ; la barre latérale de l'organisation reste affichée. Les parcours complets qui passaient par
  l'ancienne barre de l'événement sont à vérifier (les liens portent les mêmes noms, mais les pages d'une partie ne
  s'affichent que lorsqu'elle est ouverte).
- Revue visuelle de chaque écran de l'application dans le nouveau thème (titres, espacements, tableaux).

## Décisions prises

- Avertissement de fin d'un Pro offert : 3 jours avant (comme les essais Stripe).
- Pas d'offre pour les organisations créées avant sa mise en ligne (il n'y en a pas).

## Création rapide pour les visiteurs des annonces (`/start`)

En place : l'événement d'abord (nom, date, lieu, ville, prix, places), puis le compte (organisation, e-mail, mot de
passe) avec l'aperçu de l'événement ; compte, organisation et événement en brouillon créés d'un coup, le lien de
vérification mène au tableau de bord. À faire :

- Fait : les boutons d'inscription du site vitrine mènent à `/start` (le bouton du Pro garde l'inscription classique,
  qui propose le passage au Pro). Reste : l'URL finale des annonces Google Ads vers `/start` (dans Google Ads).
- Fait : parcours complet de `/start` (`e2e/quick-start.spec.ts`), jusqu'à l'événement en brouillon.
- Fait : la page de vérification de l'adresse rappelle l'événement enregistré, en attente de publication.

## Mesure

- Couverture des parcours : le paiement sur place (`PayAtVenue.tsx`) et l'import de prospects (`UploadForm.tsx`) sont
  testés mais absents de la mesure (scripts sans carte de correspondance, à vérifier) ; le parcours de la caméra du
  scanner lance son propre navigateur et n'est pas mesuré.
