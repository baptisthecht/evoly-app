#!/usr/bin/env bash
# Contrôles obligatoires avant chaque enregistrement (git commit), lancés automatiquement par git (docs/MAINTENANCE.md).
# L'enregistrement est refusé si l'un d'eux échoue. Ne jamais les contourner (git commit --no-verify).
#   1. mise en forme des fichiers enregistrés (Prettier, par lint-staged) ;
#   2. types de tout le dépôt (TypeScript) ;
#   3. tests du cœur, des traductions et du serveur de l'app (base PostgreSQL de test nécessaire).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
log=$(mktemp)

echo "1/3 Mise en forme des fichiers enregistrés"
pnpm exec lint-staged

echo "2/3 Types"
if ! pnpm -r typecheck > "$log" 2>&1; then
  grep -E "error TS" "$log" | head -20 || tail -20 "$log"
  echo "ENREGISTREMENT BLOQUÉ : erreurs de types."
  exit 1
fi

echo "3/3 Tests (cœur, traductions, serveur de l'app)"
if ! pnpm -r --if-present test:quick > "$log" 2>&1; then
  grep -E "FAIL|×|Error|ECONNREFUSED" "$log" | head -20 || tail -20 "$log"
  echo "ENREGISTREMENT BLOQUÉ : tests en échec (base de test démarrée ? voir docs/MAINTENANCE.md)."
  exit 1
fi
echo "Contrôles réussis : enregistrement autorisé."
