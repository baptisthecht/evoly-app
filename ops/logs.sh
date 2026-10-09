#!/usr/bin/env bash
# Tous les journaux d'Evoly en une commande.
#   ops/logs.sh                tout en direct : app, Caddy, base de données, tâches planifiées, sauvegardes
#   ops/logs.sh app            un seul service, en direct : app, caddy ou db
#   ops/logs.sh taches         tâches planifiées, en direct
#   ops/logs.sh sauvegardes    sauvegardes de la nuit
#   ops/logs.sh erreurs 24h    seulement les erreurs, sur une période (1h par défaut : 30m, 6h, 24h, 7d…)
# Ctrl+C pour quitter le direct.
set -euo pipefail
cd "$(dirname "$0")/.."

what="${1:-tout}"
since="${2:-1h}"

# Journal du système : réservé aux groupes systemd-journal et adm ; sinon sudo
# (pour s'en passer : sudo usermod -aG systemd-journal evoly, puis se reconnecter).
journal() {
  if [ "$(id -u)" -eq 0 ] || id -nG | grep -qwE "systemd-journal|adm"; then journalctl "$@"; else sudo journalctl "$@"; fi
}

case "$what" in
  app | caddy | db)
    exec docker compose logs -f --since "$since" "$what"
    ;;
  taches)
    journal -f -o short-iso --since "-$since" -t evoly-cron
    ;;
  sauvegardes)
    journal -o short-iso --since "-${2:-7d}" -t evoly-backup
    ;;
  erreurs)
    {
      docker compose logs --no-color --since "$since" app caddy db 2>&1
      journal -o short-iso --since "-$since" -t evoly-cron -t evoly-backup 2>&1
    } | grep -iE "error|erreur|échec|echec|failed|fatal|exception|panic|timeout|refus" || echo "Aucune erreur sur la dernière période ($since)."
    ;;
  tout)
    trap 'kill 0' INT TERM
    docker compose logs -f --since "$since" app caddy db &
    journal -f -o short-iso --since "-$since" -t evoly-cron -t evoly-backup &
    wait
    ;;
  *)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
