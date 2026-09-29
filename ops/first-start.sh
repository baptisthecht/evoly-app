#!/usr/bin/env bash
# Premier démarrage d'Evoly : image construite, base initialisée (migration initiale, contraintes, données de départ).
# À lancer une seule fois, en tant qu'evoly, depuis /opt/evoly.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo "Créez d'abord .env : cp ops/env.production.example .env"; exit 1; fi
if grep -qE '^[A-Z0-9_]+="?A_REMPLIR' .env; then echo "Des valeurs « A_REMPLIR » restent dans .env : complétez-les d'abord."; exit 1; fi

echo "==> Site vitrine et documents légaux"
python3 apps/web/build.py >/dev/null
python3 apps/web/legal.py >/dev/null

echo "==> Construction de l'image (quelques minutes)"
docker compose build app

echo "==> Base de données"
docker compose up -d --wait db
prisma() { docker compose run --rm --no-deps -v "$PWD/packages/db/prisma:/app/packages/db/prisma" app sh -c "cd /app/packages/db && npx prisma $*"; }

if [ ! -d packages/db/prisma/migrations ]; then
  echo "==> Migration initiale (créée une seule fois)"
  prisma migrate dev --create-only --name init
  echo ">>> Migration créée dans packages/db/prisma/migrations : versionnez-la (git add, commit, push)."
fi
prisma migrate deploy

if [ ! -f .constraints-applied ]; then
  echo "==> Contraintes SQL (une seule fois)"
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U evoly -d evoly < packages/db/prisma/sql/constraints.sql
  date -u > .constraints-applied
fi

echo "==> Données de départ (offres, rôles)"
docker compose run --rm --no-deps app sh -c "cd /app/packages/db && npx tsx prisma/seed.ts"

echo "==> Démarrage"
docker compose up -d
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Evoly répond. Dernière étape : crontab -u evoly ops/crontab (en root) ou crontab ops/crontab (en evoly)."
    exit 0
  fi
  sleep 2
done
echo "L'app ne répond pas : docker compose logs app"
exit 1
