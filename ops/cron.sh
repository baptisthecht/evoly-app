#!/usr/bin/env bash
# Appel d'une tâche planifiée de l'app, depuis le serveur uniquement :
#   ops/cron.sh holds|campaigns|emails|domains|automations|statements|certificates
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  holds|campaigns|emails|domains|automations|statements|certificates|publications|webhooks) ;;
  *) echo "Tâche inconnue : ${1:-(aucune)}"; exit 2 ;;
esac
# shellcheck source=ops/healthchecks.sh
. ops/healthchecks.sh

secret="$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"')"
# nouvelles tentatives pendant la première minute seulement : couvrent le redémarrage de l'app pendant un déploiement,
# jamais une tâche longue qui aurait dépassé son délai (elle pourrait encore tourner côté serveur)
status=0
out="$(curl -fsS --max-time 280 --retry 3 --retry-delay 10 --retry-max-time 60 --retry-connrefused -H "Authorization: Bearer ${secret}" "http://127.0.0.1:3000/api/cron/$1" -o /dev/null 2>&1)" || status=$?

# Surveillance (Healthchecks.io) : les tâches fréquentes ne signalent que leurs succès, un échec isolé est seulement
# consigné ; l'alerte part si aucun succès n'arrive dans le délai de grâce. Les tâches quotidiennes et mensuelles
# signalent leur code de sortie : un échec alerte tout de suite.
case "$1" in
  certificates|statements) hc_ping "$1" "$status" "$out" ;;
  *) if [ "$status" -eq 0 ]; then hc_ping "$1"; else hc_ping "$1" log "échec (code $status) : $out"; fi ;;
esac

[ -z "$out" ] || echo "$out"
exit "$status"
