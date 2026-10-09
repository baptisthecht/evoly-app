#!/usr/bin/env bash
# Crée ou met à jour les sondes Healthchecks.io des tâches planifiées, avec leurs horaires (ceux de ops/crontab, en UTC).
# À lancer une fois depuis /opt/evoly, puis après chaque changement du crontab. Idempotent : une sonde existante
# (même identifiant) est mise à jour, jamais dupliquée. Lit HEALTHCHECKS_API_KEY (clé d'API du projet, lecture-écriture).
set -euo pipefail
cd "$(dirname "$0")/.."

# guillemets, apostrophes, espaces et fins de ligne Windows retirés (une clé collée depuis un PC passe telle quelle)
key="$(grep -E '^HEALTHCHECKS_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "\"' \r" || true)"
if [ -z "$key" ]; then echo "HEALTHCHECKS_API_KEY manque dans .env (Healthchecks.io : Settings, API Access)"; exit 1; fi
api="${HEALTHCHECKS_API_URL:-https://healthchecks.io}/api/v3/checks/"

# clé dans un fichier lisible par evoly seul, jamais sur la ligne de commande (visible par les autres processus)
hdr="$(mktemp)"
chmod 600 "$hdr"
trap 'rm -f "$hdr"' EXIT
printf 'X-Api-Key: %s\nContent-Type: application/json\n' "$key" > "$hdr"

failures=0
# sonde <tâche> <nom> <horaire cron> <délai de grâce en secondes> <description>
sonde() {
  local body code
  body="$(printf '{"name":"%s","slug":"evoly-%s","schedule":"%s","tz":"UTC","grace":%s,"desc":"%s","tags":"evoly","channels":"*","unique":["slug"]}' "$2" "$1" "$3" "$4" "$5")"
  code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X POST -H "@$hdr" --data "$body" "$api" || true)"
  case "$code" in
    201) echo "créée : $2" ;;
    200) echo "mise à jour : $2" ;;
    *) echo "ÉCHEC ($code) : $2"; failures=$((failures + 1)) ;;
  esac
}

sonde holds "Libération des places" "* * * * *" 300 "Libère les places des paniers abandonnés, chaque minute. Sans elle, des places restent bloquées."
sonde publications "Publications programmées" "* * * * *" 300 "Prévient les organisateurs quand un événement programmé devient public, chaque minute."
sonde campaigns "Campagnes" "*/5 * * * *" 600 "Envoie les campagnes programmées."
sonde emails "E-mails" "*/5 * * * *" 600 "Relance les e-mails en attente."
sonde domains "Domaines" "*/10 * * * *" 1200 "Vérifie le DNS des domaines personnalisés."
sonde automations "Rappels et e-mails automatiques" "*/15 * * * *" 1800 "Rappels J-7, J-1, jour J et e-mails marketing automatiques."
sonde certificates "Certificats" "30 5 * * *" 3600 "Contrôle quotidien des certificats des domaines."
sonde statements "Relevés de commissions" "0 6 1 * *" 7200 "Émet les relevés de commissions du mois écoulé."
sonde backup "Sauvegarde" "15 3 * * *" 7200 "Sauvegarde nocturne de la base vers R2."

if [ "$failures" -gt 0 ]; then
  echo "$failures sonde(s) en échec. Erreur 401 : Healthchecks.io refuse la clé. Utilisez une clé « API key » en lecture-écriture"
  echo "(pas « read-only »), créée dans le bon projet : Settings, API Access, puis HEALTHCHECKS_API_KEY dans .env."
  exit 1
fi
echo "Les 8 sondes sont prêtes. Elles passent au vert à leur premier signal (la sauvegarde la nuit prochaine)."
