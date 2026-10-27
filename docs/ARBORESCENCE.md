# Arborescence du tableau de bord

Décidée le 28 octobre 2026. Trois niveaux : la barre latérale, les onglets de l'en-tête, puis les onglets en boutons.

## Organisation

| Barre latérale | Onglets                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| Accueil        | (des widgets vivants, voir plus bas)                                            |
| Événements     |                                                                                 |
| Commandes      |                                                                                 |
| Revente        | dernières annonces et reventes ; raccourci discret vers les réglages de revente |
| Finances       |                                                                                 |
| Marketing      | Contacts · Campagnes · Automatisations (rappels automatiques)                   |
| Marque         | Votre marque · Page de l'organisation · Adresse et domaines · E-mails           |
| Équipe         | Membres · Rôles (matrice des droits)                                            |
| Abonnement     | Offre (comparaison dans une fenêtre) · Parrainage · Lieu partenaire             |
| Paramètres     | Général · Paiements (Stripe et vos frais) · Avancé (supprimer l'organisation)   |

Le compte personnel (profil, sécurité, préférences de notifications) a sa propre page, « Mon compte ».

## Événement

| Onglet         | Onglets en boutons                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vue d'ensemble |                                                                                                                                                                  |
| Billetterie    | Tarifs · Billets offerts · Questions · Options · Tables · Plan de salle                                                                                          |
| Participants   | Commandes · Revente                                                                                                                                              |
| Apparence      | Style de la billetterie · Images (couverture) · E-mails                                                                                                          |
| Vente          | Publication (et prévente privée) · Diffusion (lien, sous-domaine, QR code, intégration) · Codes promo · Ambassadeurs · Réseaux de vente · Liste d'attente        |
| Jour J         | Contrôle des entrées · Vente sur place · Étiquettes et badges · Retrait hors ligne                                                                               |
| Réglages       | Général (l'essentiel) · Lieu · Vente (ventes, remboursement, revente, limites d'achat, protection anti-robot) · Avancé (dupliquer, annuler, archiver, supprimer) |

## Règles d'interface

- Tableaux : un seul composant, inspiré du tableau de beUI (https://beui.dev/components/motion/table). Beaux et vivants,
  sobres mais pas ternes : pastilles de statut colorées, liens, chiffres alignés, tri, sélection, état vide avec son
  bouton, lignes fantômes au chargement. Sur téléphone, une ligne devient une carte.
- Fenêtres : centrées sur ordinateur, feuille qui monte du bas sur téléphone (fermée en la tirant).
- Ajouts et réglages secondaires (ajouter un tarif, un code promo, un lien bénévole, importer des contacts) : dans une
  fenêtre, pas dans la page.
- Commandes : un seul tableau, filtre « Canal » ; les billets des réseaux sont des lignes avec la pastille du réseau.
- Pas de redirections des anciennes adresses : aucun client n'en dépend encore.

## Accueil vivant

Prochain événement (affiche, compte à rebours, jauge), dernières commandes en direct, recette des 30 derniers jours,
remplissage de chaque événement, « À faire » (Stripe pas connecté, événement sans image, brouillon oublié).

## Plus tard (pages à revoir)

Plan de salle (éditeur), Réseaux de vente, Vente sur place, Étiquettes et badges, Retrait hors ligne, Votre marque,
Domaines, Lieu partenaire, aperçu du style de la billetterie, notifications (plus petites et vivantes), Finances.
Les tables deviendront des entités à part (un tarif choisit « place seule » ou « place à une table ») : chantier séparé,
il touche les tarifs, le plan de salle et le paiement.

## Ordre de mise en œuvre

1. Le socle : tableau, fenêtre et feuille, onglets en boutons, pastilles.
2. L'arborescence : barre latérale, onglets, sections déplacées, barre d'onglets du téléphone.
3. Les tableaux, page par page.
4. L'accueil vivant.
