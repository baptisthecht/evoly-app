# Mise en production d'Evoly (VPS Debian 13)

Installation sur un seul serveur, sans outil de déploiement tiers : **Caddy** (seul service ouvert sur Internet, certificats HTTPS à la volée), **l'app** et **PostgreSQL**, dans Docker Compose. Tous les fichiers sont dans le dépôt :

| Fichier | Rôle |
|---|---|
| `Dockerfile` | image de l'app (monorepo pnpm, construite sans base ni secret réel) |
| `compose.yaml` | PostgreSQL (jamais exposé), l'app (joignable depuis le serveur seulement), Caddy (ports 80 et 443) |
| `ops/Caddyfile` | site vitrine sur le domaine principal, tout le reste en certificats à la volée après accord de l'app |
| `ops/setup-server.sh` | installation du serveur : Docker, mémoire d'échange, pare-feu, mises à jour de sécurité automatiques |
| `ops/new-env.sh`, `ops/env.production.example` | fichier d'environnement, secrets générés |
| `ops/first-start.sh` | premier démarrage : migration initiale, contraintes, données de départ |
| `ops/deploy.sh` | mises à jour |
| `ops/cron.sh`, `ops/crontab` | tâches planifiées |
| `ops/backup.sh`, `ops/restore.sh` | sauvegarde quotidienne vers R2, restauration |

Serveur conseillé au lancement : 2 cœurs, 4 Go de mémoire, 40 Go de disque (par exemple OVH VPS-1), Debian 13.

## 1. Serveur

1. Commander le VPS avec l'image **Debian 13** et une **clé SSH** (pas de mot de passe).
2. Se connecter en root, installer Git et récupérer le code :
   ```
   apt-get update && apt-get install -y git
   git clone <adresse du dépôt> /opt/evoly
   bash /opt/evoly/ops/setup-server.sh
   ```
   Le script installe Docker, crée 4 Go de mémoire d'échange (utilisée en dernier recours, pendant la construction de l'app), ouvre seulement SSH, HTTP et HTTPS dans le pare-feu, active les mises à jour de sécurité automatiques et crée l'utilisateur de service `evoly`.
3. Désactiver la connexion SSH par mot de passe (une fois la connexion par clé vérifiée) : `PasswordAuthentication no` dans `/etc/ssh/sshd_config.d/evoly.conf`, puis `systemctl restart ssh`.

## 2. DNS

Tous les enregistrements pointent vers l'adresse IPv4 du serveur (enregistrement A), et vers son IPv6 si elle existe (AAAA) :

| Nom | Usage |
|---|---|
| `evoly.me` | site vitrine, documents légaux, liens courts `/e/…` et `/r/…` |
| `www.evoly.me` | redirigé vers `evoly.me` |
| `app.evoly.me` | tableau de bord, back-office (`/admin`), espace participant |
| `scanner.evoly.me` | scanner des entrées |
| `*.evoly.me` | billetteries des organisations et sous-domaines d'événement |
| `domains.evoly.me` | cible des CNAME des domaines personnalisés |

Aucun certificat wildcard n'est nécessaire : Caddy obtient chaque certificat à la première visite, uniquement pour un domaine que l'app reconnaît (`/api/domains/allowed`).

## 3. Stripe

**Compte de la plateforme (Connect)**
- Activer Connect, comptes « Standard » avec tableau de bord complet, pays de lancement.
- Clés : `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

**Webhook des comptes connectés** → `https://app.evoly.me/api/webhooks/stripe/connect` (`STRIPE_WEBHOOK_SECRET_CONNECT`), événements :
`account.updated`, `account.application.deauthorized`, `charge.updated` (frais Stripe réels, dès que Stripe a créé la transaction du paiement), `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refund.updated`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.

**Webhook de la plateforme** → `https://app.evoly.me/api/webhooks/stripe/platform` (`STRIPE_WEBHOOK_SECRET_PLATFORM`), événements :
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`.

**Abonnement Pro**
- Créer le produit « Evoly Pro » avec deux prix TTC (29 € par mois, 295,80 € par an), et renseigner `STRIPE_PRICE_PRO_MONTH` et `STRIPE_PRICE_PRO_YEAR`.
- Portail client : changement de périodicité avec prorata, résiliation en fin de période, factures, mise à jour du moyen de paiement.
- TVA de l'abonnement : décider avec l'expert-comptable, puis `STRIPE_TAX_ENABLED`.

Les domaines Apple Pay et Google Pay sont déclarés automatiquement sur le compte de chaque organisateur (sous-domaine, sous-domaines d'événement, domaines personnalisés actifs).

**Comptes des organisateurs (Accounts v2).** Evoly crée les comptes connectés avec l'API Accounts v2, recommandée par Stripe pour les nouvelles plateformes : tableau de bord Stripe complet, frais facturés et pertes assumées par Stripe, cartes et Bancontact. L'ancien réglage « prise en charge d'Accounts v1 » n'est pas nécessaire. Le statut des comptes arrive par l'événement v1 `account.updated`, que Stripe envoie aussi pour les comptes v2, sur la destination « comptes connectés ». Choisir la même version d'API que la bibliothèque Stripe du projet pour les deux destinations (`2026-08-26.dahlia` actuellement).

## 4. E-mails (Resend)

- Domaine d'envoi vérifié : SPF, DKIM et DMARC (au minimum `p=quarantine`).
- `RESEND_API_KEY`, `EMAIL_FROM_DOMAIN` (domaine d'expédition vérifié).
- Webhook → `https://app.evoly.me/api/webhooks/resend` (`RESEND_WEBHOOK_SECRET`), événements : `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
- Suivi des ouvertures et des clics à activer dans Resend pour les statistiques des campagnes.

## 5. Fichiers et sauvegardes (Cloudflare R2)

- **Images** : bucket public (par exemple `evoly-uploads`), accessible par `files.evoly.me`, avec un jeton limité à ce bucket (`R2_*`). Sans R2, les images restent sur le serveur (volume `uploads`) et sont incluses dans la sauvegarde.
- **Sauvegardes** : un **second bucket, privé** (par exemple `evoly-backups`), avec son propre jeton *Object Read & Write* limité à ce bucket (`BACKUP_R2_*`, R2 → *Account Details* → *Manage* à côté d'*API Tokens*). Il ne doit jamais être public : les sauvegardes contiennent des données personnelles.
- **Rétention** : dans ce bucket, *Settings* → *Object lifecycle rules* → ajouter une règle qui supprime les objets **30 jours** après leur envoi. Les scripts envoient et téléchargent avec `curl` (signature S3), sans autre outil.

## 6. Apple Wallet et Google Wallet (facultatif)

Les boutons « Ajouter à Apple Wallet » et « Ajouter à Google Wallet » n'apparaissent sur la page des billets que si les identifiants correspondants sont fournis.

**Apple** (compte Apple Developer, 99 $ par an)
1. Certificates, Identifiers & Profiles → Identifiers → Pass Type IDs : créer `pass.me.evoly.ticket` (`APPLE_PASS_TYPE_ID`). L'identifiant d'équipe est `APPLE_TEAM_ID`.
2. Créer le certificat de ce Pass Type ID (demande de signature générée avec `openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr`), télécharger `pass.cer`, puis `openssl x509 -inform DER -in pass.cer -out pass.pem`.
3. Télécharger le certificat intermédiaire « Apple Worldwide Developer Relations — G4 », puis `openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem`.
4. Variables, en base64 sur une ligne : `APPLE_PASS_CERT_PEM=$(base64 -w0 pass.pem)`, `APPLE_PASS_KEY_PEM=$(base64 -w0 pass.key)`, `APPLE_WWDR_PEM=$(base64 -w0 wwdr.pem)` ; `APPLE_PASS_KEY_PASSPHRASE` si la clé est chiffrée.
5. Le certificat expire au bout d'un an : prévoir son renouvellement.

**Google** (console Google Pay & Wallet)
1. Demander l'accès émetteur (Issuer) : l'identifiant est `GOOGLE_WALLET_ISSUER_ID`.
2. Google Cloud : créer un compte de service, activer l'API Google Wallet, lui donner accès à l'émetteur, créer une clé JSON.
3. `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` = `client_email` de la clé ; `GOOGLE_WALLET_PRIVATE_KEY` = `private_key` de la clé, encodée en base64.
4. Tant que la classe « Billet d'événement » n'est pas validée par Google, les passes restent visibles uniquement par les comptes de test de la console.

Les passes affichent le même QR code que le billet : le scanner reste la seule référence (un billet revendu ou remboursé est refusé à l'entrée, même s'il reste dans le portefeuille).

## 7. Fichier d'environnement

```
sudo -iu evoly
cd /opt/evoly
ops/new-env.sh     # crée .env (lisible par evoly seul) avec les secrets générés
nano .env          # compléter les valeurs « A_REMPLIR » et les services utilisés
```

Les variables publiques (`NEXT_PUBLIC_…`) sont figées dans le code envoyé au navigateur à la construction de l'image : après les avoir modifiées, relancer `ops/deploy.sh`. Changer `BETTER_AUTH_SECRET` déconnecte tout le monde et oblige à réactiver la double authentification.

## 8. Premier démarrage

```
ops/first-start.sh
crontab ops/crontab
```

Le premier démarrage construit l'image, crée la **migration initiale** de la base (à versionner ensuite : `git add packages/db/prisma/migrations && git commit && git push`), applique les contraintes SQL et les données de départ (offres, rôles), puis démarre l'app. La crontab programme les 7 tâches planifiées et la sauvegarde quotidienne (heures en UTC).

**Premier administrateur du back-office** :
```
docker compose exec db psql -U evoly -d evoly -c "update \"User\" set \"platformRole\" = 'ADMIN' where email = 'prenom@evoly.me';"
```
À la première visite de `/admin`, la double authentification est enregistrée et 8 codes de secours sont affichés une seule fois.

## 9. Mises à jour

```
ops/deploy.sh
```
Récupère le code, reconstruit l'image, applique les migrations, redémarre l'app (coupure de quelques secondes) et vérifie qu'elle répond. À éviter pendant un événement (scanner, ouverture des ventes).

## 10. Sauvegardes et restauration

- Chaque nuit à 3 h 15 (UTC), `ops/backup.sh` envoie une sauvegarde complète de la base (et des images si elles sont sur le serveur) vers le bucket privé : 30 jours dans R2 (règle de cycle de vie du bucket), 3 jours sur le serveur.
- Restaurer : `ops/restore.sh evoly-AAAAMMJJ-HHMMSS.dump` (fichier du serveur, sinon téléchargé depuis R2 ; confirmation demandée).
- **Tester une restauration** au moins une fois par trimestre, sur une copie : une sauvegarde jamais restaurée n'est pas une sauvegarde.

## 11. Surveillance et journaux

- État : `docker compose ps` ; journaux de l'app : `docker compose logs -f app` ; de Caddy : `docker compose logs -f caddy`.
- Tâches planifiées et sauvegardes : `journalctl -t evoly-cron`, `journalctl -t evoly-backup`.
- Santé : `https://app.evoly.me/api/health` répond `{"status":"ok"}` (vérifie aussi la base). Le faire surveiller par un service externe (alerte si la page ne répond plus).

## 12. Sécurité

- Seuls les ports 22, 80 et 443 sont ouverts ; PostgreSQL n'est jamais exposé, l'app n'écoute que sur le serveur lui-même (`127.0.0.1:3000`).
- `.env` n'est lisible que par `evoly` et n'est jamais versionné ; l'image ne contient aucun secret.
- Mises à jour de sécurité du système automatiques ; reconstruire l'image régulièrement (`ops/deploy.sh`) pour les correctifs de Node.js et des paquets.
- Double authentification obligatoire pour toute l'équipe Evoly, recommandée aux propriétaires d'organisation.

## 13. Vérifications après déploiement

- `GET https://app.evoly.me/api/health` répond `{"status":"ok"}`.
- Inscription, confirmation de l'e-mail, création d'une organisation, connexion de Stripe (mode test d'abord).
- Événement payant publié, achat par carte de test, e-mail avec PDF et fichier d'agenda, scan du billet sur `scanner.evoly.me`.
- Remboursement depuis le détail de la commande, puis webhook reçu (statut « Remboursé »).
- Essai Pro par Stripe Checkout, puis webhook reçu (offre Pro active).
- Domaine personnalisé de test : CNAME, vérification, certificat émis, page servie.
- Campagne de test à soi-même, puis statistiques de délivrabilité remontées par Resend.
- Tâches planifiées : chaque adresse répond 200 avec le secret, 401 sans.

## 14. Logo dans les boîtes de réception (BIMI, Apple)

- **Prérequis : DMARC en mode strict.** Un seul enregistrement `_dmarc.evoly.me` : d'abord `v=DMARC1; p=none; rua=mailto:dmarc@evoly.me; pct=100` pendant une à deux semaines (rapports : tous les envois légitimes, Resend et la messagerie OVH, doivent passer), puis `v=DMARC1; p=quarantine; rua=mailto:dmarc@evoly.me; pct=100`.
- **BIMI** : logo SVG Tiny PS publié par le site vitrine (`https://evoly.me/bimi-evoly.svg`, fichier `apps/web/static/bimi-evoly.svg`) et enregistrement `default._bimi.evoly.me` TXT `v=BIMI1; l=https://evoly.me/bimi-evoly.svg; a=;`. Sans certificat, seuls certains services (Yahoo, AOL) peuvent l'afficher, pour les gros expéditeurs.
- **Apple Mail et iCloud** : Branded Mail d'Apple Business Connect, gratuit, sans marque déposée : entreprise vérifiée par Apple, domaine vérifié par un enregistrement TXT (sous 14 jours), logo carré (PNG 1024 × 1024), DMARC en mode strict.
- **Gmail** : certificat obligatoire, CMC (logo utilisé depuis 12 mois, sans marque déposée) ou VMC (marque déposée, coche bleue), à ajouter dans `a=` de l'enregistrement BIMI.
