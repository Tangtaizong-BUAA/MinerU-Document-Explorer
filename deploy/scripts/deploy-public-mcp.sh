#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/changyi-jiuan-mcp/app
ENV_FILE=/etc/changyi-jiuan-mcp.env
NGINX_SITE=/etc/nginx/sites-enabled/argon-kb

cd "$APP_DIR"
git fetch origin feature/changyi-jiuan-kb
git reset --hard origin/feature/changyi-jiuan-kb
npm install --no-audit --no-fund
npm run build

token="$(sed -n 's/^CYJ_MCP_BEARER_TOKEN=//p' "$ENV_FILE" | tail -1)"
if [ -z "$token" ]; then
  token="$(openssl rand -hex 32)"
  if grep -q '^CYJ_MCP_BEARER_TOKEN=' "$ENV_FILE"; then
    sed -i "s/^CYJ_MCP_BEARER_TOKEN=.*/CYJ_MCP_BEARER_TOKEN=$token/" "$ENV_FILE"
  else
    printf '\nCYJ_MCP_BEARER_TOKEN=%s\n' "$token" >> "$ENV_FILE"
  fi
fi
chown root:changyi-kb "$ENV_FILE"
chmod 0640 "$ENV_FILE"

install -d -o root -g root -m 0755 /etc/nginx/backups
cp -p "$NGINX_SITE" /etc/nginx/backups/argon-kb.bak-cyj
cp /tmp/argon-kb.nginx.new "$NGINX_SITE"
if ! nginx -t; then
  cp /etc/nginx/backups/argon-kb.bak-cyj "$NGINX_SITE"
  nginx -t
  exit 1
fi

rm -f /tmp/argon-kb.nginx.new
systemctl restart changyi-jiuan-mcp.service
systemctl reload nginx
systemctl is-active changyi-jiuan-mcp.service nginx
