#!/usr/bin/env bash
# Restauration de la base depuis une sauvegarde : ops/restore.sh evoly-AAAAMMJJ-HHMMSS.dump
# (cherchée d'abord dans /var/backups/evoly, sinon téléchargée depuis R2). Remplace la base actuelle.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=ops/r2.sh
. ops/r2.sh

name="${1:?Nom de la sauvegarde, par exemple evoly-20261015-031500.dump}"
file="/var/backups/evoly/$name"
if [ ! -f "$file" ]; then
  echo "Téléchargement de $name depuis R2…"
  r2_get "base/$name" "$file"
fi

read -r -p "La base actuelle sera remplacée par $name. Tapez RESTAURER pour confirmer : " ok
if [ "$ok" != "RESTAURER" ]; then echo "Annulé."; exit 1; fi

docker compose stop app caddy
docker compose exec -T db pg_restore -U evoly -d evoly --clean --if-exists --no-owner < "$file"
docker compose up -d
echo "Base restaurée depuis $name."
