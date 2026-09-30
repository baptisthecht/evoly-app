#!/usr/bin/env bash
# Envoi et téléchargement vers le bucket R2 PRIVÉ des sauvegardes, par l'API S3 (signature AWS v4 calculée par curl).
# Chargé par backup.sh et restore.sh depuis /opt/evoly. Lit R2_ACCOUNT_ID et BACKUP_R2_* dans .env.
# La rétention (30 jours) est une règle de cycle de vie du bucket, configurée dans Cloudflare.

r2_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'; }

r2_url() {
  local endpoint="${R2_ENDPOINT_OVERRIDE:-https://$(r2_env R2_ACCOUNT_ID).r2.cloudflarestorage.com}"
  printf '%s/%s/%s' "$endpoint" "$(r2_env BACKUP_R2_BUCKET)" "$1"
}

# identifiants dans un fichier lisible par evoly seul, jamais sur la ligne de commande (visible par les autres processus)
r2_curl() {
  local cfg status
  cfg="$(mktemp)"
  chmod 600 "$cfg"
  printf 'user = "%s:%s"\n' "$(r2_env BACKUP_R2_ACCESS_KEY_ID)" "$(r2_env BACKUP_R2_SECRET_ACCESS_KEY)" > "$cfg"
  status=0
  curl -fsS --retry 3 --retry-delay 5 --aws-sigv4 "aws:amz:${R2_REGION_OVERRIDE:-auto}:s3" -K "$cfg" "$@" || status=$?
  rm -f "$cfg"
  return "$status"
}

r2_put() { r2_curl -T "$1" -o /dev/null "$(r2_url "$2")"; }
r2_get() { r2_curl -o "$2" "$(r2_url "$1")"; }
