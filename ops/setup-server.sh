#!/usr/bin/env bash
# Installation d'un VPS Debian 13 (trixie) pour Evoly. À lancer une seule fois, en root :
#   bash /opt/evoly/ops/setup-server.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "À lancer en root (sudo bash ops/setup-server.sh)."; exit 1; fi
# shellcheck disable=SC1091
. /etc/os-release
if [ "${VERSION_CODENAME:-}" != "trixie" ]; then echo "Attention : prévu pour Debian 13 (trixie), système détecté : ${PRETTY_NAME:-inconnu}"; fi
export DEBIAN_FRONTEND=noninteractive

echo "==> Mises à jour et outils"
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg git ufw rclone python3 unattended-upgrades cron
systemctl enable --now cron

echo "==> Mises à jour de sécurité automatiques"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

echo "==> Docker (dépôt officiel)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
# journaux des conteneurs limités (le disque ne se remplit pas)
cat > /etc/docker/daemon.json <<'CONF'
{ "log-driver": "local", "log-opts": { "max-size": "20m", "max-file": "5" } }
CONF
systemctl restart docker

echo "==> Mémoire d'échange (swap) de 4 Go, utilisée en dernier recours"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-evoly-swap.conf
sysctl -p /etc/sysctl.d/99-evoly-swap.conf

echo "==> Pare-feu : SSH, HTTP, HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Utilisateur de service « evoly »"
id evoly >/dev/null 2>&1 || useradd -m -s /bin/bash evoly
usermod -aG docker evoly
install -d -o evoly -g evoly /opt/evoly /var/backups/evoly
chown -R evoly:evoly /opt/evoly

echo
echo "Terminé. Suite, en tant qu'evoly :"
echo "  sudo -iu evoly"
echo "  cd /opt/evoly && cp ops/env.production.example .env && nano .env"
echo "  ops/first-start.sh"
