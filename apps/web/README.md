# Evoly - landing organisateurs

Page d'accueil statique, en un seul fichier HTML, pour la billetterie Evoly.

## Contenu du dossier

- `build.py` : assemble la page (textes, sections, SVG) et produit `dist/evoly-billetterie.html`.
- `styles.css` : tous les styles (charte Evoly, mode sombre, mobile).
- `app.js` : animations et interactions (GSAP 3.15.0 + ScrollTrigger, Lenis 1.3.26).
- `paths.py` : tracés vectoriels du logo et du O perforé, repris de la charte.
- `dist/evoly-billetterie.html` : la page prête à publier.
- `tools/shots.py` et `tools/probe.py` : captures d'écran et mesures avec Playwright, pour vérifier le rendu.

## Construire

```
python3 build.py          # dist/evoly-billetterie.html (Google Fonts + jsDelivr)
python3 build.py --test   # test.html hors ligne, pour les outils de contrôle
```

Pour `--test`, les polices et bibliothèques sont lues en local : `/tmp/fonts` et `/tmp/libs` par défaut, ou les dossiers indiqués par `EVOLY_FONTS` et `EVOLY_LIBS`.

Polices : Archivo Black, Archivo 300/700, Poppins 400/500/600, Yellowtail.

## Où modifier quoi

- Textes et sections : `BODY` dans `build.py`.
- FAQ : liste `FAQ`.
- Tableau « ce qu'on fait de plus » : liste `ROWS`.
- Offres : `FREE_LIST` et `PRO_LIST`.
- Moyens de paiement affichés : `PMS`.
- Maquette des e-mails automatiques : `MAILS`.
- Liens vers l'app : `REGISTER`, `REGISTER_PRO` et `LOGIN`, en haut de `build.py`.
- Simulateur : bloc « calculateur » dans `app.js`.
  - Commission : 0,15 € + 1,5 % par billet, plafonnée à 1 € en Free et 0,70 € en Pro.
  - Abonnement Pro : 29 € par mois.
  - Frais bancaires : carte européenne, 1,5 % + 0,25 €.
  - Tarifs des 9 concurrents : liste `RIVALS`, relevés en septembre 2026.

Au build, la typographie française est ajoutée automatiquement : espaces insécables avant ?, !, :, % et €, et pas de coupure dans « e-mail », « J-7 » ou les formules de prix.

## À savoir

- La page est autonome : aucune image externe, polices Google Fonts, scripts sur jsDelivr.
- Sans JavaScript ou avec « réduire les animations », tout reste lisible et utilisable.
- Le configurateur de marque lit le logo dans le navigateur : rien n'est envoyé.

## Points à valider

- Les réponses de la FAQ : versements, fin de l'essai Pro, résiliation, domaine personnalisé, annulation d'un événement, comparaison avec HelloAsso.
- Qui paie les frais sur une revente : le vendeur ou l'acheteur.
- Les moyens de paiement réellement activés dans Stripe.
