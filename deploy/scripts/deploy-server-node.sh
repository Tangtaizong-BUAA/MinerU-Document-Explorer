#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/changyi-jiuan-mcp/app
UNIT_SOURCE=/tmp/changyi-jiuan-mcp.service
UNIT_TARGET=/etc/systemd/system/changyi-jiuan-mcp.service

cd "$APP_DIR"
npm install --no-audit --no-fund
npm run build

install -o root -g root -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
rm -f "$UNIT_SOURCE"
systemctl daemon-reload
systemctl start changyi-jiuan-mcp.service
systemctl is-active changyi-jiuan-mcp.service
