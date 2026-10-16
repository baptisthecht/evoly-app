#!/usr/bin/env bash
# Contrôles obligatoires avant chaque envoi sur GitHub (git push), lancés automatiquement par git (voir docs/MAINTENANCE.md) :
#   1. sécurité des dépendances : pnpm audit, envoi bloqué dès qu'une faille modérée ou plus grave est trouvée ;
#   2. mise en forme : Prettier, envoi bloqué si un fichier n'est pas formaté ;
#   3. une fois par semaine : nouvelles versions des dépendances (ops/versions-check.mjs), pour migrer sans casser ;
#   4. tests avec les seuils de couverture (pnpm -r test), comme l'intégration continue ;
#   5. construction de l'app et parcours complets dans le navigateur (ops/e2e.sh), comme l'intégration continue.
# Ne jamais contourner ces contrôles (git push --no-verify).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# une seule garde à la fois : deux gardes en parallèle se gênent (dossier de couverture de Vitest, port 3001, bases neuves) ;
# le verrou d'une garde disparue (processus terminé) est ignoré
lock="${TMPDIR:-/tmp}/evoly-garde.lock"
if [ -f "$lock" ] && kill -0 "$(cat "$lock" 2> /dev/null)" 2> /dev/null; then
  echo "ENVOI BLOQUÉ : une autre garde tourne déjà (processus $(cat "$lock")). Attendez sa fin, puis relancez l'envoi."
  exit 1
fi
echo $$ > "$lock"
guard_db=""
admin_url=""
cleanup() {
  if [ -n "$guard_db" ]; then psql "$admin_url" -qc "DROP DATABASE IF EXISTS $guard_db WITH (FORCE)" > /dev/null 2>&1 || true; fi
  rm -f "$lock"
}
trap cleanup EXIT

echo "1/5 Sécurité des dépendances (pnpm audit)"
if ! pnpm audit --audit-level moderate; then
  echo "ENVOI BLOQUÉ : faille modérée ou plus grave. Mettez la dépendance à jour (docs/MAINTENANCE.md), ou justifiez une exception dans docs/SECURITE.md."
  exit 1
fi

echo "2/5 Mise en forme (Prettier)"
if ! pnpm -s format:check; then
  echo "ENVOI BLOQUÉ : fichiers mal formatés. Lancez « pnpm format », enregistrez, puis renvoyez."
  exit 1
fi

echo "3/5 Nouvelles versions (une fois par semaine)"
stamp="$(git rev-parse --git-dir)/evoly-versions-check"
now=$(date +%s)
last=$(cat "$stamp" 2>/dev/null || echo 0)
if [ $((now - last)) -ge 604800 ]; then
  node ops/versions-check.mjs || echo "Vérification des versions impossible (réseau ?) : elle sera refaite au prochain envoi."
  [ -n "${EVOLY_SKIP_STAMP:-}" ] || echo "$now" > "$stamp"
else
  echo "Déjà faite il y a moins de 7 jours."
fi
log=$(mktemp)
# Base neuve, préparée exactement comme dans l'intégration continue (schéma, contraintes, données de départ) :
# les tests et les parcours ne dépendent jamais des données laissées par des essais précédents. Supprimée à la fin.
base_url="${DATABASE_URL:-postgresql://evoly:evoly@localhost:5432/evoly}"
guard_db="evoly_garde_$$"
admin_url="${base_url%/*}/postgres"
# bases laissées par une garde interrompue (processus disparu) : supprimées ; celles d'une garde encore en cours, jamais
for old in $(psql "$admin_url" -tAc "select datname from pg_database where datname like 'evoly_garde_%'" 2> /dev/null); do
  kill -0 "${old#evoly_garde_}" 2> /dev/null || psql "$admin_url" -qc "DROP DATABASE IF EXISTS $old WITH (FORCE)" > /dev/null 2>&1 || true
done
echo "Base de données neuve ($guard_db), préparée comme dans l'intégration continue"
psql "$admin_url" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $guard_db" > "$log" 2>&1 || { cat "$log"; echo "ENVOI BLOQUÉ : création de la base neuve impossible."; exit 1; }
export DATABASE_URL="${base_url%/*}/$guard_db"
schema() {
  pnpm --filter @evoly/db exec prisma db push
  # sans moteur de schéma Prisma (environnement isolé) la base reste vide : on applique alors les migrations, une par une
  if [ "$(psql "$DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")" = "0" ]; then
    for f in packages/db/prisma/migrations/*/migration.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" || return 1; done
  fi
}
if ! { schema && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f packages/db/prisma/sql/constraints.sql && pnpm db:seed; } > "$log" 2>&1; then
  tail -20 "$log"
  echo "ENVOI BLOQUÉ : préparation de la base neuve impossible."
  exit 1
fi

echo "4/5 Tests et seuils de couverture"
tests_log="$(git rev-parse --git-dir)/evoly-last-tests.log" # gardé pour relever le cliquet de couverture (docs/MAINTENANCE.md)
if ! pnpm -r test > "$tests_log" 2>&1; then
  cp "$tests_log" "$log"
  grep -E "FAIL|×|ERROR: Coverage|threshold" "$log" | head -20 || tail -20 "$log"
  echo "ENVOI BLOQUÉ : tests en échec ou couverture sous le seuil."
  exit 1
fi

echo "5/5 Construction et parcours complets (Playwright)"
if ! bash ops/e2e.sh > "$log" 2>&1; then
  grep -E "✘|failed|Error|ÉCHEC" "$log" | head -20 || tail -20 "$log"
  echo "ENVOI BLOQUÉ : parcours complets en échec."
  exit 1
fi
echo "Contrôles réussis : envoi autorisé."
