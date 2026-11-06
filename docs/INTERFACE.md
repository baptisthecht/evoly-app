# Consignes d'interface du tableau de bord

Comment écrire un écran de l'espace organisateur après la refonte A3. Le pourquoi et l'historique des choix sont dans
[DECISIONS.md](DECISIONS.md), les maquettes de référence dans [`UIUX/`](../UIUX/README.md). La billetterie publique,
l'espace des acheteurs, le scanner et evoly.me gardent la charte d'origine.

Avant de livrer un écran, se poser la question : quelqu'un pourrait-il dire sans hésiter qu'une IA l'a fait ? Si oui,
ce n'est pas fini.

## Structure

- **Des lignes, pas des cartes.** Listes et tableaux : des lignes séparées par des filets (`border-line`), groupées
  sous un titre de section (`text-[0.9375rem] font-semibold`) et un lien discret à droite (« Toutes les commandes »).
- **Une seule surface par niveau.** Jamais de carte dans une carte. La carte (`Card`) est réservée à un vrai objet
  (un graphique, un formulaire isolé), pas à chaque bloc.
- **Pas d'ombre**, sauf pour ce qui flotte : fenêtre, menu, feuille du téléphone.
- **Une chose qui ressort par écran** (le grand chiffre, le bandeau). Au plissement d'yeux, le reste est calme.
- **Indicateurs** : en ligne, sans carte, séparés par des filets verticaux, avec le composant `Stat` (libellé gris,
  chiffre en Archivo Black). Trois ou quatre au plus. Ne jamais afficher un indicateur qui n'est pas calculé.

## Couleur

- Les rôles passent par les jetons de `packages/ui` : aucune couleur en dur (un test le vérifie).
- **Charbon** : la barre latérale (`.theme-sidebar`) et le bouton principal.
- **Rose**, trois rôles seulement :
  - la page active (trait dans la barre latérale) ;
  - le trait du rythme sur les jauges (`--highlight`) ;
  - ce qui est mis en avant ou sélectionné : bandeau (`bg-highlight-soft`), ligne sélectionnée, texte rose
    `text-highlight-ink`.
- **Vert, orange, rouge** : des statuts uniquement (payé, en avance, un peu lent, dépassé, échec). Montants retirés
  (remboursements, frais) en `text-minus`, net en `text-success`.
- **Le trait rose** d'un bandeau ou d'une ligne sélectionnée est un rectangle (`before:` en position absolue, largeur
  `var(--highlight-bar)`), découpé par l'arrondi de son conteneur (`overflow-hidden`) : arrondi à gauche, droit à
  droite. Jamais une bordure ni une ombre intérieure.

## Typographie

- Police du système (Poppins dans le thème) pour tout le texte, titres de page compris.
- **Archivo Black** (`font-figures`, `tracking-[var(--tracking-figures)]`) : grands chiffres, compte à rebours, jour
  des feuilles de calendrier. Nulle part ailleurs : ni titres, ni boutons, ni libellés.
- Chiffres alignés : `tabular-nums` dans les tableaux et les montants.
- **Pas de capitales espacées**, pas d'écriture script (Yellowtail) dans l'app, pas de salutation ni de slogan.

## Composants

- **Jauge de ventes** : toujours `SalesGauge` (`components/ui/SalesGauge.tsx`), qui porte le trait du rythme et dit le
  rythme en mots. La règle est dans `packages/core/src/pace.ts`.
- **Date d'un événement dans une liste** : `DateLeaf` (feuille de calendrier) en début de ligne.
- **Tableaux** : le composant unique `DataTable`. Ligne sélectionnée : fond `bg-highlight-soft` et trait rose.
- **Fenêtres** : `Dialog` (centrée sur ordinateur, feuille du bas sur téléphone). Le bouton dit ce qu'il fait
  (« Créer le tarif », pas « Valider »).
- **Pastilles** : statut avec un point, sans animation. Pas de point qui pulse en continu.

## Icônes et mouvement

- Toujours une icône dessinée (SVG, trait 1,75 à 2) : jamais `→`, `›`, `⌄`, `×`, `•••` ou ✨ comme icône.
- Les initiales seulement pour des personnes de l'équipe, en gris neutre. Pas de pastille d'initiales sur les
  commandes : le nombre de billets dit plus.
- Le mouvement répond à une action (ouvrir, confirmer). Pas d'animation d'entrée sur les blocs ou les lignes.
  `prefers-reduced-motion` est toujours respecté.

## Mots

- Le verbe exact : « Copier le lien », « Renvoyer les billets », « Créer le tarif ».
- Pas de flèche « → » ni de tiret long décoratif. Une information par colonne, ou une phrase. Le point médian « · »
  reste toléré dans le sous-titre d'une ligne (détails secondaires), jamais dans un titre, un libellé ou entre deux
  chiffres.
- Typographie française : apostrophes courbes, espaces insécables avant « : ; ? ! € % ».
- Chaque nouveau texte dans les 7 langues (`packages/i18n`).
