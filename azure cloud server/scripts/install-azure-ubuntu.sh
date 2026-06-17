#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/install-azure-ubuntu.sh" >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

id -u webdrop >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin webdrop
install -d -o webdrop -g webdrop /opt/webdrop
install -d -m 0750 /etc/webdrop
install -d -m 0755 /var/www/certbot

cat >/etc/security/limits.d/webdrop.conf <<'LIMITS'
webdrop soft nofile 200000
webdrop hard nofile 200000
www-data soft nofile 200000
www-data hard nofile 200000
LIMITS

cat >/etc/sysctl.d/99-webdrop-signaling.conf <<'SYSCTL'
fs.file-max = 500000
fs.nr_open = 500000
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
SYSCTL
sysctl --system

echo "Base packages installed. Copy the azure cloud server folder to /opt/webdrop, configure /etc/webdrop/signaling.env, then run scripts/deploy.sh."
