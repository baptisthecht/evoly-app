# Offres commerciales

Gérées depuis l'administration (**Administration › Offres**, `/admin/offres`), sans déploiement : création, modification,
suspension, statistiques. Une offre donne le Pro pendant une durée à une nouvelle organisation qui remplit ses
conditions, **une seule fois par organisation**, sans carte bancaire ; l'organisation redevient Free toute seule à la fin
(abonnement attribué par Evoly) et son propriétaire est prévenu 3 jours avant.

## Options d'une offre

| Option               | Effet                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Code de campagne     | Identifiant, lien `https://app.evoly.me/start?offre=CODE` et statistiques                    |
| Active               | Suspendre ou réactiver à tout moment ; les offres déjà attribuées ne changent pas            |
| Durée                | En mois ou en jours de Pro                                                                   |
| Début, fin           | Heure de Bruxelles ; vides : dès maintenant, sans fin                                        |
| Public               | Toute nouvelle organisation, ou seulement par le lien de la campagne                         |
| Pays, types, sources | Pays de l'organisation, type (association, entreprise…), `utm_source` de la visite           |
| Nombre maximal       | Plafond d'organisations, jamais dépassé, même pour des inscriptions simultanées              |
| Par organisateur     | Nombre d'organisations d'un même organisateur qui en profitent                               |
| Priorité             | La plus haute l'emporte si plusieurs offres s'appliquent (puis la campagne, la plus récente) |
| Annoncer sur le site | Bandeau du site vitrine, de l'inscription et de la création rapide                           |
| Textes (7 langues)   | Bandeau (l'offre et ses conditions), mention courte (encadré Pro), bouton                    |

## Où elle apparaît

- **Site vitrine** : `apps/web/offer.js` lit l'offre en cours (`GET /api/public/offer?lang=fr&offre=CODE`) et remplit le
  bandeau, l'encadré Pro et les boutons Pro ; sans offre, les textes habituels restent (essai Pro de 14 jours).
- **Application** : inscription (`/register`) et création rapide (`/start`) affichent l'offre de la campagne suivie,
  sinon l'offre publique.
- **Code de campagne** : `?offre=CODE` sur le site ou l'application, mémorisé 60 jours (cookie nécessaire `evoly_offer`).

## Où elle est attribuée

À un seul endroit : la création d'une organisation (`createOrganization`, `apps/app/src/server/onboarding.ts`), qui
cherche l'offre applicable (`findPromotionFor`) et l'attribue de façon atomique (`redeemPromotion`). Règles pures :
`packages/core/src/promotions.ts` ; serveur : `apps/app/src/server/promotions.ts`.

## Statistiques

Par offre : bénéficiaires (et plafond), encore sous l'offre, ont publié un événement, ont vendu, sont passés au Pro
payant après l'offre. Voir aussi **Administration › Acquisition** pour la source des inscriptions.

## Offre de lancement

Reprise en base par la migration `20261021090000_promotions` (code `lancement-2026`, 3 mois de Pro, jusqu'au
31 mars 2027 à 23 h 59, textes dans les 7 langues). À l'échéance, elle s'arrête d'elle-même, sur le site comme dans
l'application.
