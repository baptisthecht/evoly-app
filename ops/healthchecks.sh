#!/usr/bin/env bash
# Signaux envoyés à Healthchecks.io pour surveiller les tâches planifiées.
# Chargé par cron.sh et backup.sh depuis /opt/evoly. Inactif tant que HEALTHCHECKS_PING_KEY est absent de .env.
# Ne fait jamais échouer une tâche : sans clé, sans réseau ou si Healthchecks.io ne répond pas, il ne se passe rien.
# Sondes créées et réglées par ops/healthchecks-setup.sh (identifiants evoly-<tâche>).

hc_env() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"' \r" || true; }

# hc_ping <tâche> [suffixe] [message]
#   sans suffixe : succès ; « start » : début ; « log » : simple entrée d'historique ; 0-255 : code de sortie (0 = succès)
hc_ping() {
  local key url
  key="$(hc_env HEALTHCHECKS_PING_KEY)"
  [ -n "$key" ] || return 0
  url="${HEALTHCHECKS_PING_URL:-https://hc-ping.com}/${key}/evoly-$1${2:+/$2}"
  curl -fsS --max-time 10 --retry 2 -o /dev/null --data-binary "${3:-}" "$url" 2>/dev/null || true
}
