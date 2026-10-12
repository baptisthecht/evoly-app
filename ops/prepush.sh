#!/usr/bin/env bash
# Contrôles obligatoires avant chaque envoi sur GitHub (git push), lancés automatiquement par git (voir docs/MAINTENANCE.md) :
#   1. sécurité des dépendances : pnpm audit, envoi bloqué dès qu'une faille modérée ou plus grave est trouvée ;
#   2. mise en forme : Prettier, envoi bloqué si un fichier n'est pas formaté ;
#   3. une fois par semaine : nouvelles versions des dépendances (ops/versions-check.mjs), pour migrer sans casser.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "1/3 Sécurité des dépendances (pnpm audit)"
if ! pnpm audit --audit-level moderate; then
  echo "ENVOI BLOQUÉ : faille modérée ou plus grave. Mettez la dépendance à jour (docs/MAINTENANCE.md), ou justifiez une exception dans docs/SECURITE.md."
  exit 1
fi

echo "2/3 Mise en forme (Prettier)"
if ! pnpm -s format:check; then
  echo "ENVOI BLOQUÉ : fichiers mal formatés. Lancez « pnpm format », enregistrez, puis renvoyez."
  exit 1
fi

echo "3/3 Nouvelles versions (une fois par semaine)"
stamp="$(git rev-parse --git-dir)/evoly-versions-check"
now=$(date +%s)
last=$(cat "$stamp" 2>/dev/null || echo 0)
if [ $((now - last)) -ge 604800 ]; then
  node ops/versions-check.mjs || echo "Vérification des versions impossible (réseau ?) : elle sera refaite au prochain envoi."
  [ -n "${EVOLY_SKIP_STAMP:-}" ] || echo "$now" > "$stamp"
else
  echo "Déjà faite il y a moins de 7 jours."
fi
echo "Contrôles réussis : envoi autorisé."
