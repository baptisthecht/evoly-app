#!/usr/bin/env bash
# Mise à jour d'Evoly sans coupure : la nouvelle version démarre à côté de l'ancienne et ne la remplace qu'une fois saine
# (contrôle de santé du Dockerfile). Pendant la bascule, Caddy réessaie au lieu d'afficher une erreur (ops/Caddyfile).
# Si la nouvelle version ne démarre pas, elle est abandonnée et l'ancienne reste en ligne.
# Règle : les migrations doivent rester compatibles avec la version en cours (ajouts de tables ou de colonnes ;
# pas de suppression ni de renommage dans le même déploiement), puisqu'elle sert encore pendant quelques secondes.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
python3 apps/web/build.py >/dev/null
python3 apps/web/legal.py >/dev/null
docker compose build app
docker compose run --rm --no-deps -v "$PWD/packages/db/prisma:/app/packages/db/prisma:ro" app sh -c "cd /app/packages/db && npx prisma migrate deploy"

healthy() { [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}aucun{{end}}' "$1" 2>/dev/null)" = "healthy" ]; }

old=$(docker compose ps -q app | head -n 1)
if [ -z "$old" ]; then
  docker compose up -d
else
  # 1. la nouvelle version démarre à côté de l'ancienne, qui continue de servir
  docker compose up -d --no-deps --no-recreate --scale app=2 app
  new=$(docker compose ps -q app | grep -vx "$old" | head -n 1)
  for _ in $(seq 1 90); do
    healthy "$new" && break
    sleep 2
  done
  if ! healthy "$new"; then
    docker logs --tail 60 "$new" || true
    docker stop "$new" >/dev/null || true
    docker rm "$new" >/dev/null || true
    echo "La nouvelle version ne démarre pas : elle est abandonnée, l'ancienne reste en ligne (journal ci-dessus)."
    exit 1
  fi
  # 2. l'ancienne finit ses requêtes en cours puis s'arrête ; Caddy n'envoie plus qu'à la nouvelle
  sleep 3
  docker stop -t 30 "$old" >/dev/null
  docker rm "$old" >/dev/null
  docker compose up -d --no-deps --no-recreate --scale app=1 app
  # 3. Caddy : recréé seulement si sa configuration Docker a changé ; sinon le Caddyfile est rechargé à chaud
  docker compose up -d --no-deps caddy
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || true
fi
docker image prune -f >/dev/null
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Déployé sans coupure : Evoly répond."
    exit 0
  fi
  sleep 2
done
echo "Evoly ne répond pas après le déploiement : docker compose logs app caddy"
exit 1
