#!/usr/bin/env bash
# Mise à jour d'Evoly : code récupéré, image reconstruite, migrations appliquées, redémarrage.
# Coupure de quelques secondes : à éviter pendant un événement (scanner, ouverture des ventes).
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
python3 apps/web/build.py >/dev/null
python3 apps/web/legal.py >/dev/null
docker compose build app
docker compose run --rm --no-deps -v "$PWD/packages/db/prisma:/app/packages/db/prisma:ro" app sh -c "cd /app/packages/db && npx prisma migrate deploy"
docker compose up -d
docker image prune -f >/dev/null
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then echo "Déployé : Evoly répond."; exit 0; fi
  sleep 2
done
echo "Evoly ne répond pas après le déploiement : docker compose logs app"
exit 1
