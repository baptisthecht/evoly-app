# À faire

Points en attente, par ordre d'urgence. Les tests restants à écrire sont listés à part dans `test.md`.

## Avant le prochain déploiement

- **Relancer les parcours complets** (`ops/e2e.sh` ou la CI) : ils n'ont pas tourné depuis l'ajout du bandeau des cookies
  (`apps/app/src/components/tracking`) et de l'offre de lancement. Le bandeau, fixé en bas de l'écran, peut masquer des
  boutons : poser le choix des cookies dans la fonction commune des parcours (`apps/app/e2e/fixtures.ts`) si besoin.
- **Déployer** : application (avec la migration `20261020120000_acquisition`) et site vitrine reconstruit.
- **Google Ads** : inscrire l'identifiant `AW-…` et les libellés des conversions « Inscription » et « Organisation
  créée » (`EVOLY_IDS` dans `apps/app/src/components/tracking/Analytics.tsx`), voir `docs/TRACKING.md`.

## Offres commerciales gérées en base et dans l'administration

Aujourd'hui, l'offre de lancement (3 mois de Pro offerts jusqu'au 31 mars 2027) est écrite dans le code
(`packages/core/src/launchOffer.ts`) et dans les textes du site (`apps/web/build.py`, `refonte.py`, `i18n/`). La
modifier ou l'arrêter demande un déploiement. À remplacer par :

- une table `Promotion` : nom, offre attribuée (Pro), durée (en jours ou en mois), période de validité (début, fin),
  public visé (toutes les nouvelles organisations, un lien ou un code précis), limite par organisateur, active ou non ;
- une page de l'administration pour créer, modifier, suspendre une offre, et voir les organisations qui en ont profité ;
- l'attribution à la création d'une organisation : la première offre active qui s'applique, tracée dans le journal ;
- un texte d'offre lu par le site vitrine depuis l'application (point d'accès public en lecture), dans les 7 langues,
  pour que le bandeau et l'encadré Pro suivent l'offre sans reconstruire le site ;
- la reprise de l'offre actuelle dans cette table, puis la suppression de `launchOffer.ts` et de `LAUNCH_OFFER_UNTIL`.

## Après le 31 mars 2027 (si l'offre est encore dans le code)

- Retirer du site le bandeau de l'offre, remettre « Essai gratuit de 14 jours » dans l'encadré Pro et « Essayer Pro
  14 jours » sur les boutons (les traductions existent encore dans `apps/web/i18n/`).

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
