# Consignes d'interface du tableau de bord

Comment écrire un écran de l'espace organisateur après la refonte A3. Le pourquoi et l'historique des choix sont dans
[DECISIONS.md](DECISIONS.md), les maquettes de référence dans [`UIUX/`](../UIUX/README.md). La billetterie publique,
l'espace des acheteurs, le scanner et evoly.me gardent la charte d'origine.

Avant de livrer un écran, se poser la question : quelqu'un pourrait-il dire sans hésiter qu'une IA l'a fait ? Si oui,
ce n'est pas fini.

## Structure

- **Des lignes, pas des cartes.** Listes et tableaux : des lignes séparées par des filets (`border-line`), groupées
  sous un titre de section (`SectionTitle` : 14,5 px demi-gras) et un lien discret à droite (« Toutes les commandes »).
- **Aucune carte encadrée.** Les maquettes n'en ont pas : dans l'espace organisateur, `Card` n'est plus qu'une partie
  de page séparée de la suivante par un filet (globals.css, `.evoly-card`). Pour un écran neuf, écrire directement des
  rangées ou des sections, pas de `Card`.
- **Réglages et formulaires de page** : `SettingsRow` (« .setrow » de la maquette Réglages) : le titre et l'explication
  dans une colonne de 250 px, les champs à droite sur 560 px au plus (`wide` pour un éditeur avec aperçu). Champs
  côte à côte : `grid gap-3 sm:grid-cols-2`. Le bouton d'envoi à sa taille, jamais étiré.
- **Le bouton d'une page** (« Nouveau tarif », « Offrir des billets », un export) va à droite des onglets en boutons,
  dans `BarActions` ; une explication de la page, en 13 px gris, au-dessus de son contenu (720 px au plus).
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
- **Tableaux** : le composant unique `DataTable`. Ligne sélectionnée : fond `bg-highlight-soft` et trait rose. Un
  tableau écrit à la main reprend ses classes : en-têtes gris de 12,5 px (`px-2.5 py-[7px]`), cellules à 10 px, un
  filet sous chaque ligne. Sur téléphone, des lignes séparées par des filets ; `mobileLines` pour la disposition en
  trois lignes de la maquette (titre et montant, détail et pastille, référence et date).
- **Fenêtres** : `Dialog` (centrée sur ordinateur, feuille du bas sur téléphone). Ses boutons vont dans son pied gris
  (`DialogFooter`, le bouton d'envoi porte `form={id}`), « Annuler » à gauche du bouton principal. Le bouton dit ce qu'il
  fait (« Créer le tarif », pas « Valider »).
- **Champs** : 40 px, filet de 1 px, arrondi 8 px (`Input`, `Select`, `TEXTAREA_CLASS`) ; dates et heures avec
  `DateTimeField` (« 21 nov. 2026, 20:00 », jamais le « jj/mm/aaaa » du navigateur) ; recherche et filtres d'une barre
  d'outils en 34 px (`SearchField`, `FilterSelect`). Choix exclusifs : choix segmenté (`segClass`) ou choix en cartes
  (`choiceCardClass`) ; réglages oui/non : interrupteur (`SwitchRow`).
- **Téléphone** : pas de barre en haut ; la barre d'onglets blanche en bas (Accueil, Événements, Commandes, Finances,
  Plus), la même dans un événement ; le titre de page en 28 px.
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
