#!/usr/bin/env bash
# Couverture des parcours complets : code exécuté par le navigateur (Chromium) et par le serveur pendant les parcours.
# Prérequis : la base et les variables de la CI (voir .github/workflows/ci.yml). Rien n'est installé dans le projet.
# Usage : ops/e2e-coverage.sh   → rapports dans /tmp/e2e-coverage/{client,server}
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/apps/app"
work="${E2E_COVERAGE_WORK:-/tmp/e2e-coverage}"
rm -rf "$work" && mkdir -p "$work/client" "$work/server" "$work/tools"

# 1. construction avec les cartes de correspondance vers les sources (jamais en production)
E2E_COVERAGE=1 pnpm --filter @evoly/app build

# 2. serveur qui enregistre son code exécuté, et l'écrit à son arrêt
(cd "$app" && NODE_V8_COVERAGE="$work/server" NODE_OPTIONS="--require $root/ops/coverage-flush.cjs" npx next start -p 3001 > "$work/server.log" 2>&1) &
npx wait-on -t 60000 http://localhost:3001/api/health

# 3. parcours, qui enregistrent le code exécuté par chaque page
status=0
(cd "$app" && E2E_COVERAGE_DIR="$work/client" npx playwright test) || status=$?

# 4. arrêt propre du serveur : il écrit sa couverture
pkill -TERM -f "next start -p 3001" || true
sleep 5

# 5. rapports, reliés aux sources de apps/app/src (outil installé hors du projet)
npm i --prefix "$work/tools" monocart-coverage-reports@2 --no-audit --no-fund > /dev/null
cp "$root/ops/e2e-coverage-report.mjs" "$work/tools/report.mjs"
for kind in client server; do
  APP_DIR="$app" CLIENT_DIR="$work/client" SERVER_DIR="$work/server" OUT_DIR="$work" node "$work/tools/report.mjs" "$kind"
done
exit "$status"
