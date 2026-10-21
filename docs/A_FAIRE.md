# À faire

Points en attente, par ordre d'urgence. Les tests restants à écrire sont listés à part dans `test.md`.

## Déploiement du 21 octobre 2026 (fait)

- Déployé avec `ops/deploy.sh` (CI au vert) : migrations de la période appliquées, site vitrine reconstruit.
- Recherche de lieux : `GEOAPIFY_API_KEY` en production, requêtes visibles dans les statistiques de Geoapify.
- Google Ads : balise `AW-18525196474`, conversions « Organisation créée » (principale) et « Inscription »
  (secondaire), objectif « Achat » retiré de la campagne ; URL finale des annonces : `https://app.evoly.me/start`.
- À surveiller : sous 48 heures, les deux conversions doivent passer de « Inactive » à l'enregistrement ; dans deux
  ou trois semaines, rapport « Performances des éléments » de l'annonce (remplacer les titres classés « Faible »).
- Le 31 mars 2027 : fin de l'offre de lancement, retirer le titre « 3 mois de Pro offerts » des annonces.
- Restent à faire : polices de la marque sur les billets PDF faites ; champs des réglages d'un événement sur deux
  colonnes si l'affichage pleine largeur paraît trop étiré.

## Avant le prochain déploiement

- **Relancer les parcours complets** (`ops/e2e.sh` ou la CI) : ils n'ont pas tourné depuis l'ajout du bandeau des cookies
  (`apps/app/src/components/tracking`) et de l'offre de lancement. Le bandeau, fixé en bas de l'écran, peut masquer des
  boutons : poser le choix des cookies dans la fonction commune des parcours (`apps/app/e2e/fixtures.ts`) si besoin.
- **Déployer** : application (avec la migration `20261020120000_acquisition`) et site vitrine reconstruit.

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
