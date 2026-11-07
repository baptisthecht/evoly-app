# Décisions de design

Les décisions d'interface prises par le porteur du projet. Elles priment sur les habitudes et sur les règles générales
du design system. Les maquettes de référence sont dans `UIUX/`.

## 7 novembre 2026 : conformité aux maquettes A3, toutes les pages

Le porteur du projet veut chaque écran conforme aux maquettes « à 100 % ». Les écrans maquettés sont comparés pixel par
pixel (captures et images de différence) ; les autres reprennent les mêmes formes.

- **Plus de cartes encadrées** dans l'espace organisateur : des parties séparées par des filets, des rangées de
  réglages (titre à gauche, champs à droite), des tableaux à filets.
- **Fenêtres** : toutes au modèle de « Nouveau tarif » (pied gris, boutons à droite, « Annuler » avant le bouton
  principal).
- **Téléphone** : la barre d'onglets blanche de la maquette remplace la capsule flottante (variante D), y compris dans
  un événement ; plus de barre en haut (les notifications passent dans « Plus ») ; les tableaux deviennent des lignes
  séparées par des filets.
- **Écarts assumés**, chacun pour une raison : la maquette coupe la colonne « Date » des commandes à 1200 px (le tableau
  défile) ; sur les téléphones de la maquette, les champs et « Exporter » perdent leur filet par une erreur de la
  maquette (variable `--line2` définie seulement dans `.desk`) ; des fonctions existantes absentes des maquettes
  restent (filtre « Canal », réglages de revente repliés, protection anti-robots, « Plus d'options » d'un tarif).
- **Accessibilité avant le pixel** : le gris des onglets inactifs de la barre du téléphone passe de `#8f8782`
  (maquette, contraste 3,5:1) à `#7a736e` (4,6:1, exigé pour un texte de 11 px, test d'accessibilité et test des
  jetons) ; le nom d'une option reste l'en-tête de sa ligne dans Finances.
- **Statut toujours visible** : sur téléphone, l'en-tête d'un événement en vente n'a pas de pastille (comme la
  maquette), mais un brouillon, un événement programmé, annulé ou terminé garde la sienne ; la liste des événements,
  sans maquette sur téléphone, montre la pastille sous le lieu.

## 6 novembre 2026 : refonte « A3 » du tableau de bord

Direction choisie après comparaison de trois pistes (outil sobre, charte assainie, « Jour J ») puis de quatre doses de
marque. Maquettes : `UIUX/propositions-a3.html` (accueil, option 2), `UIUX/pages-a3.html` et
`UIUX/pages-a3-suite.html` (autres pages).

**Base : l'outil sobre.**

- Police du système pour tout le texte, les titres de page compris (« Accueil » en police normale, pas en Archivo
  Black).
- Des lignes séparées par des filets plutôt que des cartes. Une seule surface par niveau, jamais de carte dans une
  carte, pas d'ombre sauf pour ce qui flotte (fenêtre, menu).
- Pas de salutation ni d'écriture script dans l'app : Yellowtail reste à evoly.me et à la billetterie publique.
- Pas de décor à la place du contenu (ronds, carrés tournés), pas de point qui pulse en continu, pas de pastille
  d'initiales sur les commandes (le nombre de billets à la place). Les initiales restent pour les membres de l'équipe,
  en gris neutre.
- Aucun caractère comme icône (`→`, `›`, `⌄`, `•••`) : des icônes dessinées.

**Touches de marque (dose « A3 »).**

- Barre latérale en charbon. La page active est marquée d'un trait rose.
- Archivo Black pour les grands chiffres (indicateurs) et le jour des feuilles de calendrier, nulle part ailleurs.
- Rose réservé à trois rôles : la page active, le trait du rythme sur les jauges, ce qui est mis en avant ou
  sélectionné.
- Vert, orange et rouge réservés aux statuts.

**Accueil.**

- Trois indicateurs en ligne, sans carte, avec leur évolution et l'histogramme de la recette.
- Bandeau du prochain événement en rose pâle : compte à rebours, jauge du rythme, « Copier le lien » et « Ouvrir ».
- En dessous, le tableau des événements suivants, chaque ligne commençant par une feuille de calendrier (mois en
  rose, jour en Archivo Black).
- Puis les dernières commandes et « À faire ».
- La frise des semaines à venir a été essayée puis écartée.

**Le trait rose du bandeau et des lignes sélectionnées.** C'est un rectangle de 7 px posé contre le bord gauche,
pas une bordure ni une ombre intérieure : la surface arrondie qui le contient le découpe, il est donc arrondi à
gauche et droit à droite.

**La jauge du rythme.** Toute jauge de ventes porte un trait rose à la part de la période de vente déjà passée.
La phrase dit « en avance », « dans le rythme », « un peu lent » ou « complet ». La règle est dans
`packages/core/src/pace.ts`.
