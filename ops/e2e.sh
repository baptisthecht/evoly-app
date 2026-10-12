#!/usr/bin/env bash
# Parcours complets (Playwright), exactement comme l'intégration continue : construction de l'app, démarrage sur le
# port 3001, parcours, arrêt du serveur. Usage : bash ops/e2e.sh [fichiers ou motifs Playwright, par défaut tous]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/apps/app"

export DATABASE_URL="${DATABASE_URL:-postgresql://evoly:evoly@localhost:5432/evoly}"
export BETTER_AUTH_SECRET=ci-secret-ci-secret-ci-secret-0123456789
export BETTER_AUTH_URL=http://localhost:3001 NEXT_PUBLIC_APP_URL=http://localhost:3001
export NEXT_PUBLIC_BASE_DOMAIN=localhost:3001 NEXT_PUBLIC_SITE_URL=http://localhost:3000
export ORDER_TOKEN_SECRET=ci-order-token-secret-0123456789abcdef CRON_SECRET=ci-cron-secret-0123456789abcdef
export AUTH_GOOGLE_ID=evoly-test.apps.googleusercontent.com AUTH_GOOGLE_SECRET=secret-de-test
export APPLE_PASS_TYPE_ID=pass.me.evoly.test APPLE_TEAM_ID=TEAM123456
export GOOGLE_WALLET_ISSUER_ID=3388000000012345678 GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL=wallet@evoly-test.iam.gserviceaccount.com
export EMAIL_OUTBOX_DIR=/tmp/evoly-outbox NEXT_TELEMETRY_DISABLED=1

# identifiants Wallet de test, générés à chaque exécution (base64 sur une ligne, sous Linux comme sous macOS)
d=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$d/key.pem" -out "$d/cert.pem" -days 2 -subj "/CN=Pass Type ID: pass.me.evoly.test" 2> /dev/null
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$d/google.pem" 2> /dev/null
b64() { base64 < "$1" | tr -d '\n'; }
export APPLE_PASS_CERT_PEM="$(b64 "$d/cert.pem")" APPLE_PASS_KEY_PEM="$(b64 "$d/key.pem")" APPLE_WWDR_PEM="$(b64 "$d/cert.pem")"
export GOOGLE_WALLET_PRIVATE_KEY="$(b64 "$d/google.pem")"

npx playwright install chromium > /dev/null
echo "Construction de l'app…"
pnpm build > /tmp/evoly-e2e-build.log 2>&1 || { tail -40 /tmp/evoly-e2e-build.log; echo "ÉCHEC : construction de l'app"; exit 1; }
npx next start -p 3001 > /tmp/evoly-e2e-server.log 2>&1 &
server=$!
trap 'kill "$server" 2> /dev/null || true' EXIT
npx --yes wait-on -t 90000 http://localhost:3001/api/health
echo "Parcours complets…"
npx playwright test "$@"
