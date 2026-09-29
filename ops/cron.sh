#!/usr/bin/env bash
# Appel d'une tâche planifiée de l'app, depuis le serveur uniquement :
#   ops/cron.sh holds|campaigns|emails|domains|automations|statements|certificates
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  holds|campaigns|emails|domains|automations|statements|certificates) ;;
  *) echo "Tâche inconnue : ${1:-(aucune)}"; exit 2 ;;
esac
secret="$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"')"
curl -fsS --max-time 280 -H "Authorization: Bearer ${secret}" "http://127.0.0.1:3000/api/cron/$1" >/dev/null
