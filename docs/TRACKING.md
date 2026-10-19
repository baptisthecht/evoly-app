# Traçage : mesure d'audience, Google Ads et source des inscriptions

Conforme au RGPD et à l'ePrivacy (Belgique) : rien n'est déposé ni chargé sans accord, refuser est aussi simple
qu'accepter, le choix se change à tout moment (« Gérer les cookies »). **Jamais** de traçage sur les billetteries des
organisateurs, la billetterie intégrée (`/integre`) ni le scanner : les acheteurs de billets ne sont pas suivis.

## Ce qui est mesuré

| Où                                   | Quoi                                                                                                | Outil                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| Site vitrine (evoly.me)              | Visites, parcours, clics vers l'inscription (`sign_up_start`)                                       | Google Analytics 4               |
| Application (app.evoly.me)           | Inscription confirmée (`sign_up`), organisation créée (`organization_created`)                      | Google Analytics 4 et Google Ads |
| Base de données (aucun cookie tiers) | Source de la première visite de chaque organisation : campagne, site d'origine, identifiant de clic | `Organization.acquisition`       |
| Administration › Acquisition         | Par source et campagne : organisations, publication, première vente, Pro                            | `/admin/acquisition`             |
| Export pour Google Ads               | Conversions hors ligne « Organisation créée » et « Premier billet vendu »                           | `/admin/acquisition/export`      |

Cookies : `evoly_consent` (choix, 1 an, nécessaire), `evoly_src` (source, 90 jours, avec accord), `evoly_evt`
(événement confirmé, 10 minutes, avec accord), cookies Google (avec accord). Liste publique : `apps/web/legal/cookies.md`.
Le code : `packages/core/src/tracking.ts` (règles), `apps/app/src/components/tracking/` (bandeau, Google),
`apps/app/src/server/trackingServer.ts` (source et événements côté serveur), `apps/web/tracking.js` (site vitrine).

## Comptes à créer (une seule fois)

1. **Google Analytics 4** (analytics.google.com) : un compte « Evoly », une propriété (fuseau Europe/Bruxelles, euro),
   un flux Web pour `evoly.me`. Noter l'identifiant de mesure `G-XXXXXXX`. Dans Administration › Flux de données ›
   Configurer les paramètres du tag › Configurer vos domaines : ajouter `evoly.me` et `app.evoly.me`.
2. **Google Ads** (ads.google.com), **par la page de l'offre promotionnelle**, en « mode expert » : Outils ›
   Conversions › Nouvelle action › Site Web, créer **« Inscription »** et **« Organisation créée »** (catégorie
   « Inscription », valeur aucune, comptage « une »). Noter l'identifiant `AW-XXXXXXXXX` et le libellé de chacune.
   Créer aussi une action **« Premier billet vendu »** de type « Importer › Clics sur les annonces », et une
   **« Organisation créée »** importée si l'on préfère l'import au tag. Saisir le numéro de TVA (facturation par Google
   Ireland, autoliquidation).
3. **Associer Google Ads et Analytics** (Analytics › Administration › Liens Google Ads).
4. **Google Search Console** (facultatif, recommandé) : propriété de domaine `evoly.me`, vérifiée par DNS.

## Réglages

Identifiants publics d'Evoly, inscrits dans le code et utilisés **seulement sur evoly.me** (jamais en local ni en CI) :
Google Analytics `G-CCC58XTQ4D` (`EVOLY_IDS` dans `apps/app/src/components/tracking/Analytics.tsx`, et `build.py` pour
le site). Google Ads : l'identifiant `AW-…` et les libellés des conversions s'y ajoutent dès qu'ils sont créés. Les
variables ci-dessous les remplacent partout.

Application (variables d'environnement, voir `.env.example`) :

```
NEXT_PUBLIC_GA_ID=G-XXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_ID=AW-XXXXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL=libellé de « Inscription »
NEXT_PUBLIC_GOOGLE_ADS_ORG_LABEL=libellé de « Organisation créée »
```

Site vitrine (à la construction, `pnpm --filter @evoly/web build`) : `EVOLY_GA_ID`, `EVOLY_GOOGLE_ADS_ID`,
`EVOLY_BASE_DOMAIN=evoly.me`. Sans identifiant, rien n'est chargé (le bandeau et la source restent actifs).

Au déploiement : appliquer la migration `20261020120000_acquisition` (colonne `Organization.acquisition`).

## Vérifier

- Google Tag Assistant (tagassistant.google.com) sur evoly.me puis app.evoly.me : avant le choix, les signaux de
  consentement sont tous « denied » ; après « Tout accepter », « granted ».
- Analytics › Rapports › Temps réel : la visite apparaît après acceptation, pas avant.
- Google Ads › Conversions : « Inscription » passe à « Enregistrement des conversions » après une inscription de test.

## Chaque mois : conversions hors ligne

Administration › Acquisition › « Conversions pour Google Ads (CSV) », puis Google Ads › Outils › Conversions ›
Importer › Importer depuis un fichier. Google apprend ainsi quelles annonces amènent des organisateurs qui vendent
vraiment (et pas seulement des inscriptions). Seuls les clics acceptés par l'internaute (publicité) y figurent ;
Google n'accepte que les 90 derniers jours.

## Liens de campagne

Toujours des paramètres `utm_*` sur les liens partagés (e-mails, réseaux, partenaires), par exemple
`https://evoly.me/?utm_source=newsletter&utm_medium=email&utm_campaign=rentree-2026` ; Google Ads ajoute lui-même
`gclid` (balisage automatique, activé par défaut).
