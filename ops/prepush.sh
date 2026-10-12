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
