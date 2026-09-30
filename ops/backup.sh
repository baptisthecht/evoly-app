#!/usr/bin/env bash
# Sauvegarde quotidienne de la base (et des fichiers si R2 n'est pas utilisé pour les images) vers un bucket R2 PRIVÉ.
# Rétention : 30 jours dans R2 (règle de cycle de vie du bucket), 3 jours sur le serveur.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=ops/r2.sh
. ops/r2.sh

if [ -z "$(r2_env BACKUP_R2_BUCKET)" ]; then echo "BACKUP_R2_BUCKET manque dans .env"; exit 1; fi
stamp="$(date -u +%Y%m%d-%H%M%S)"
dir=/var/backups/evoly
mkdir -p "$dir"
file="$dir/evoly-$stamp.dump"

docker compose exec -T db pg_dump -U evoly -d evoly --format=custom > "$file"
if [ ! -s "$file" ]; then echo "Sauvegarde vide : échec"; exit 1; fi
r2_put "$file" "base/$(basename "$file")"

# fichiers envoyés par les organisateurs : seulement s'ils sont sur le serveur (sans bucket R2 pour les images)
if [ -z "$(r2_env R2_BUCKET)" ]; then
  up="$dir/uploads-$stamp.tgz"
  docker run --rm -v evoly_uploads:/data:ro -v "$dir":/backup debian:trixie-slim tar czf "/backup/$(basename "$up")" -C /data .
  r2_put "$up" "fichiers/$(basename "$up")"
fi

find "$dir" -name 'evoly-*.dump' -mtime +3 -delete
find "$dir" -name 'uploads-*.tgz' -mtime +3 -delete
echo "Sauvegarde envoyée : $(basename "$file") ($(du -h "$file" | cut -f1))"
