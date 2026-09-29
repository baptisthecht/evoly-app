#!/usr/bin/env bash
# Crée /opt/evoly/.env à partir du modèle, avec des secrets générés. Il reste à compléter les autres « A_REMPLIR ».
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env existe déjà : rien n'est modifié."; exit 1; fi
cp ops/env.production.example .env
chmod 600 .env
for key in POSTGRES_PASSWORD BETTER_AUTH_SECRET ORDER_TOKEN_SECRET CRON_SECRET; do
  sed -i "s|^${key}=\"A_REMPLIR\"|${key}=\"$(openssl rand -hex 32)\"|" .env
done
echo ".env créé (lisible par evoly seul). À compléter :"
grep -E '^[A-Z0-9_]+="?A_REMPLIR' .env | cut -d= -f1
