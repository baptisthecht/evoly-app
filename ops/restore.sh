#!/usr/bin/env bash
# Restauration de la base depuis une sauvegarde : ops/restore.sh evoly-AAAAMMJJ-HHMMSS.dump
# (cherchée d'abord dans /var/backups/evoly, sinon téléchargée depuis R2). Remplace la base actuelle.
set -euo pipefail
cd "$(dirname "$0")/.."

name="${1:?Nom de la sauvegarde, par exemple evoly-20261015-031500.dump}"
val() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'; }
file="/var/backups/evoly/$name"
if [ ! -f "$file" ]; then
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(val BACKUP_R2_ACCESS_KEY_ID)"
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(val BACKUP_R2_SECRET_ACCESS_KEY)"
  RCLONE_CONFIG_R2_ENDPOINT="https://$(val R2_ACCOUNT_ID).r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY RCLONE_CONFIG_R2_ENDPOINT
  rclone copyto "r2:$(val BACKUP_R2_BUCKET)/base/$name" "$file"
fi

read -r -p "La base actuelle sera remplacée par $name. Tapez RESTAURER pour confirmer : " ok
if [ "$ok" != "RESTAURER" ]; then echo "Annulé."; exit 1; fi

docker compose stop app caddy
docker compose exec -T db pg_restore -U evoly -d evoly --clean --if-exists --no-owner < "$file"
docker compose up -d
echo "Base restaurée depuis $name."
