# Compatibilité avec les réseaux de billetterie

Fonction majeure de l’expansion (France en priorité) : un organisateur qui vend aussi par Ticketmaster (Ticketnet,
Leclerc, Auchan, Cultura), France Billet (Fnac, Carrefour, Géant, Magasins U, Intermarché), BilletReduc, un office de
tourisme ou un comité d’entreprise gère **tout dans Evoly** : la jauge, le contrôle à l’entrée et le bilan par canal.

## Comment travaillent les organisateurs (constat, octobre 2026)

1. Un contrat et un **contingent** par réseau et par représentation, sans obligation de vente pour le réseau.
2. Chaque réseau vend sous sa marque, avec **ses propres codes-barres** (souvent linéaires : Code 128, entrelacé 2 parmi 5,
   EAN ; parfois PDF417 ou QR), puis reverse la recette moins sa commission.
3. À l’entrée, un seul système de contrôle : les réseaux transmettent leurs billets **par fichier** (CSV, Excel) ou en temps
   réel (accords avec Fnac/France Billet et Ticketmaster, chez les billetteries installées). BilletReduc sait aussi imprimer
   des **codes créés à l’avance** par la billetterie de l’organisateur.
4. Chaque trimestre, l’organisateur déclare **toutes** ses ventes, réseaux compris, au ministère de la Culture (SIBIL).

## Ce que fait Evoly

### 1. Réseaux

Un réseau appartient à l’organisation et sert à tous ses événements : Ticketmaster, France Billet (Fnac), BilletReduc,
Pass Culture, office de tourisme, comité d’entreprise, ou un nom libre. Logo et couleur par type pour les écrans.

### 2. Contingents

Pour un événement, l’organisateur confie à un réseau un nombre de places **par tarif**. Règle unique, testée, utilisée
partout (page publique, panier, liste d’attente, tables, vue d’ensemble, notifications, relances) :

    places en vente sur Evoly = quantité du tarif − vendues − en cours de paiement − confiées aux réseaux

La jauge de l’événement compte aussi les places confiées. Un contingent se modifie à tout moment, mais jamais sous le
nombre de billets déjà importés pour ce réseau et ce tarif. **Rendre les invendus** ramène le contingent au nombre de
billets importés : les places reviennent à la vente en ligne (et à la liste d’attente).

### 3. Import des billets d’un réseau, en 1 clic

L’organisateur choisit le réseau, dépose le fichier (CSV avec « ; » ou « , », Excel), et c’est importé :

- **colonnes reconnues seules** (en-têtes en français et en anglais, avec ou sans accents) : code-barres, nom, prénom,
  tarif, prix, place, numéro de réservation, nombre de places ; sans en-tête, la colonne qui ressemble à des
  codes-barres est retenue ; reconnaissance incertaine : on montre le choix des colonnes, une seule fois, puis il est
  mémorisé pour ce réseau ;
- **tarif** : retrouvé par son nom ; sinon le tarif du contingent de ce réseau s’il n’y en a qu’un ; sinon demandé ;
- **réservation sans code-barres** (liste de contremarques BilletReduc) : un billet par place, retrouvé au contrôle par le
  nom ou le numéro de réservation ;
- **réimport sans doublon** : le même fichier, ou un fichier complété, met à jour sans dupliquer (clé : le code-barres,
  ou la réservation et le rang de la place) ; option « fichier complet » pour annuler les billets disparus, jamais par
  défaut ;
- compte rendu : billets ajoutés, mis à jour, ignorés (avec la ligne et la raison), et **dépassement de contingent**
  signalé sans bloquer (les billets ont été vendus).

Les billets importés **ne passent jamais par le paiement d’Evoly** : aucune commission, aucun versement, absents des
finances, des remboursements, de la revente et des e-mails aux acheteurs. Ils comptent dans la jauge (dans leur contingent)
et dans les entrées.

### 4. Codes créés à l’avance (BilletReduc et autres)

Evoly génère un lot de codes réservés à un réseau (un par place de son contingent), exportés en CSV pour impression par le
réseau. Ils se scannent comme les billets d’Evoly.

### 5. Contrôle à l’entrée

- **Formats** : QR, Code 128, Code 39, Code 93, entrelacé 2 parmi 5, EAN-13, EAN-8, UPC, Codabar, PDF417, Aztec, Data Matrix.
  Détecteur du navigateur quand il existe, bibliothèque de lecture sinon (iPhone), chargée seulement si besoin.
- **Douchettes** (lecteurs laser USB ou Bluetooth qui tapent le code puis Entrée) : acceptées dans le champ de saisie.
- **Hors connexion** : les billets importés sont dans la liste de l’appareil (empreintes, comme les billets d’Evoly).
- **Un seul passage** quel que soit le canal ; recherche par nom ou numéro de réservation pour les contremarques.
- À l’écran : le réseau d’origine, le tarif, la place si le fichier la donne.

### 6. Bilan

Vue d’ensemble de l’événement et page dédiée : par canal (Evoly en ligne, sur place, chaque réseau), places confiées,
billets importés, entrées, recette déclarée par le réseau si le fichier la donne. Export CSV.

## Données personnelles

L’organisateur est responsable du traitement ; Evoly ne garde que ce qui sert au contrôle (nom, réservation, place), ne
les ajoute **jamais** aux contacts ni au marketing, et les anonymise après l’événement (délai : voir les questions).

## Tests (fidélité et sécurité)

Serveur : règle des places en vente (tous les écrans), contingent jamais sous les importés, rendre les invendus, import
(séparateurs, Excel, BOM, accents, sans en-tête, tarifs, réservations sans code, réimport idempotent, fichier complet,
dépassement), scan des codes importés (en ligne, hors connexion, double passage entre canaux), exclusion des finances et
des e-mails. Navigateur : écrans des réseaux, des contingents et de l’import ; lecture des formats. Parcours complet :
contingent, import d’un fichier, scan d’un code-barres importé, bilan par canal.

## Phases

1. Modèle de données, règle des places en vente, réseaux et contingents (avec tous les écrans de disponibilité).
2. Import en 1 clic, réimport, compte rendu.
3. Scanner : formats, douchettes, hors connexion, affichage du canal ; codes créés à l’avance.
4. Bilan par canal et export ; traductions dans les 7 langues ; parcours complet.

Ensuite, séparément : déclaration SIBIL (fichier trimestriel puis API), Pass Culture (API ouverte aux logiciels de
billetterie), point de vente pour les offices de tourisme (sans valider l’entrée), temps réel avec la Fnac et Ticketmaster
(accords nécessaires).

## État au 22 octobre 2026

Fait, testé et envoyé (offre Pro et Partenaire) :

- règle unique des places en vente, appliquée partout (panier, billets offerts, confirmation, page publique, liste d’attente,
  jauge, quantité et suppression d’un tarif, tables) ;
- réseaux de l’organisation ; contingents par tarif sous le verrou de l’événement ; places numérotées confiées sur le plan
  (panneau « Réseau de vente » de l’éditeur) ; rendre les invendus ; places confiées conservées à la modification d’un bloc ;
- import en 1 clic (CSV, Excel .xlsx par un lecteur maison sur fflate) : colonnes reconnues ou demandées une fois puis
  mémorisées par réseau, tarifs retrouvés, un billet par place, réimport sans doublon, fichier complet, lignes ignorées avec
  leur vrai numéro, places du plan reliées, double vente signalée, dépassement de contingent signalé ;
- scanner : billets importés dans la liste des appareils (hors connexion), codes des réseaux scannés ou tapés, places
  suivantes d’une réservation, tous les formats que l’appareil sait lire, ZXing sur iPhone, douchettes, réseau affiché ;
- codes créés à l’avance pour un réseau (BilletReduc), pris sur son contingent, export CSV pour impression ;
- bilan par canal (Evoly en ligne, sur place, offerts, chaque réseau) et son export ; noms anonymisés 30 jours après ;
- parcours complet de bout en bout (`e2e/distribution.spec.ts`).

Pour plus tard :

- déclaration SIBIL (fichier trimestriel, puis API du ministère de la Culture) ;
- Pass Culture (API ouverte aux logiciels de billetterie, accès sur demande) ;
- point de vente pour les offices de tourisme (vente sur leur quota sans valider l’entrée, montant à reverser) ;
- codes créés à l’avance avec un plan de salle ;
- import des listes en PDF ; temps réel avec la Fnac et Ticketmaster (accords nécessaires).

## Questions ouvertes

Tranchées le 22 octobre 2026 : offre Pro uniquement ; noms anonymisés 30 jours après l’événement ; places numérotées choisies
sur le plan pour chaque réseau, reliées à l’import. Reste à décider : l’ordre des chantiers « pour plus tard ».
