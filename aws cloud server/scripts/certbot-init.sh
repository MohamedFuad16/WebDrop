#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-signal.webdrop.example.com}"
EMAIL="${EMAIL:-admin@example.com}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo DOMAIN=signal.example.com EMAIL=you@example.com bash scripts/certbot-init.sh" >&2
  exit 1
fi

if [[ "$DOMAIN" == "signal.webdrop.example.com" || "$EMAIL" == "admin@example.com" ]]; then
  echo "Replace DOMAIN and EMAIL before requesting a real certificate." >&2
  exit 1
fi

certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --email "$EMAIL" \
  -d "$DOMAIN"

sed "s/signal.webdrop.example.com/${DOMAIN}/g" "$SOURCE_DIR/nginx/webdrop-signaling.conf" >/etc/nginx/sites-available/webdrop-signaling.conf
nginx -t
systemctl reload nginx
