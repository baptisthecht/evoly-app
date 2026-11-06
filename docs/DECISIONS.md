# Décisions de design

Les décisions d'interface prises par le porteur du projet. Elles priment sur les habitudes et sur les règles générales
du design system. Les maquettes de référence sont dans `UIUX/`.

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
