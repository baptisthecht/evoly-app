# evoly-cron — Container Docker pour les tâches planifiées

## Stack
- Alpine 3.19 + curl + dcron (crond)
- Timezone : Europe/Paris

## Jobs

| Job | Fréquence | Route |
|-----|-----------|-------|
| Reset quota mensuel | 1er du mois à 00h05 | `/api/cron/reset-quota` |
| Libération réserves 30j | Chaque jour à 02h00 | `/api/cron/release-reserves` |
| Downgrade impayés Pro | Chaque jour à 03h00 | `/api/cron/downgrade-unpaid` |
| Emails auto + campagnes | Toutes les 5 min | `/api/cron/email-automations` |

## Déploiement sur Coolify

### 1. Créer un nouveau service dans Coolify
- Type : **Dockerfile**
- Source : dossier `cron/` du repo Evoly
- Réseau : même réseau que `evoly-app` (ex: `evoly_default`)

### 2. Variables d'environnement à injecter

```
APP_URL=http://evoly-app:3001
CRON_SECRET=<même valeur que dans apps/app/.env>
```

> `APP_URL` utilise le nom Docker du container app, pas le domaine public.
> Cela évite de sortir par Internet pour les appels internes.

### 3. Build & Deploy
Coolify détecte le `Dockerfile` dans le dossier `cron/` et build l'image.
Le container tourne en continu, dcron envoie les jobs selon le crontab.

### 4. Vérification des logs
Dans Coolify → Logs du container `evoly-cron` :
```
curl: (0) ... (succès silencieux)
```

Ou directement dans le container :
```bash
tail -f /var/log/cron.log
```

## Sécurité
Tous les endpoints `/api/cron/*` vérifient le header `x-cron-secret`.
Si le secret ne correspond pas → 401, le job est ignoré.
