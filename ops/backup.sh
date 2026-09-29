#!/usr/bin/env bash
# Sauvegarde quotidienne de la base (et des fichiers si R2 n'est pas utilisé) vers un bucket R2 PRIVÉ.
# Rétention : 30 jours dans R2, 3 jours sur le serveur.
set -euo pipefail
cd "$(dirname "$0")/.."

val() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'; }
stamp="$(date -u +%Y%m%d-%H%M%S)"
dir=/var/backups/evoly
mkdir -p "$dir"
file="$dir/evoly-$stamp.dump"

docker compose exec -T db pg_dump -U evoly -d evoly --format=custom > "$file"
if [ ! -s "$file" ]; then echo "Sauvegarde vide : échec"; exit 1; fi

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(val BACKUP_R2_ACCESS_KEY_ID)"
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(val BACKUP_R2_SECRET_ACCESS_KEY)"
RCLONE_CONFIG_R2_ENDPOINT="https://$(val R2_ACCOUNT_ID).r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY RCLONE_CONFIG_R2_ENDPOINT
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
bucket="$(val BACKUP_R2_BUCKET)"
if [ -z "$bucket" ]; then echo "BACKUP_R2_BUCKET manque dans .env"; exit 1; fi

rclone copyto "$file" "r2:$bucket/base/$(basename "$file")"
rclone delete --min-age 30d "r2:$bucket/base/"

# fichiers envoyés par les organisateurs : seulement s'ils sont sur le serveur (sans R2 pour les images)
if [ -z "$(val R2_BUCKET)" ]; then
  up="$dir/uploads-$stamp.tgz"
  docker run --rm -v evoly_uploads:/data:ro -v "$dir":/backup debian:trixie-slim tar czf "/backup/$(basename "$up")" -C /data .
  rclone copyto "$up" "r2:$bucket/fichiers/$(basename "$up")"
  rclone delete --min-age 30d "r2:$bucket/fichiers/"
fi

find "$dir" -name 'evoly-*.dump' -mtime +3 -delete
find "$dir" -name 'uploads-*.tgz' -mtime +3 -delete
echo "Sauvegarde envoyée : $(basename "$file") ($(du -h "$file" | cut -f1))"
