#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-signal.webdrop.example.com}"
APP_DIR="${APP_DIR:-/opt/webdrop/azure-cloud-server}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root from the server: sudo DOMAIN=${DOMAIN} bash scripts/deploy.sh" >&2
  exit 1
fi

install -d -o webdrop -g webdrop "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude .DS_Store \
  --exclude .workflow \
  "$SOURCE_DIR/" "$APP_DIR/"

cd "$APP_DIR"
npm ci --omit=dev || npm install --omit=dev
chown -R webdrop:webdrop "$APP_DIR"

cp "$SOURCE_DIR/systemd/webdrop-signaling.service" /etc/systemd/system/webdrop-signaling.service
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.webdrop-backup 2>/dev/null || true
cp "$SOURCE_DIR/nginx/nginx.conf.tuned" /etc/nginx/nginx.conf
if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" && -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]]; then
  sed "s/signal.webdrop.example.com/${DOMAIN}/g" "$SOURCE_DIR/nginx/webdrop-signaling.conf" >/etc/nginx/sites-available/webdrop-signaling.conf
else
  cat >/etc/nginx/sites-available/webdrop-signaling.conf <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /healthz {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto http;
    }
}
NGINX
  echo "TLS certificate was not found for ${DOMAIN}; installed HTTP bootstrap vhost. Run certbot-init.sh, then deploy.sh again."
fi
ln -sf /etc/nginx/sites-available/webdrop-signaling.conf /etc/nginx/sites-enabled/webdrop-signaling.conf

nginx -t
systemctl daemon-reload
systemctl enable webdrop-signaling
systemctl restart webdrop-signaling
systemctl reload nginx

echo "Deployed WebDrop signaling. Check: systemctl status webdrop-signaling --no-pager"
