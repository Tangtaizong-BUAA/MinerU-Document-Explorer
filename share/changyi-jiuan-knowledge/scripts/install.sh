#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
client="${1:-}"

if [ -z "$client" ]; then
  if command -v codex >/dev/null 2>&1; then
    client="codex"
  elif command -v qodercli >/dev/null 2>&1 || [ -d "/Applications/Qoder.app" ]; then
    client="qoder"
  elif command -v hermes >/dev/null 2>&1; then
    client="hermes"
  else
    echo "未检测到 Codex、Qoder 或 Hermes。请显式运行：bash scripts/install.sh codex|qoder|hermes" >&2
    exit 1
  fi
fi

case "$client" in
  codex) exec bash "$script_dir/install-mcp.sh" ;;
  qoder) exec bash "$script_dir/install-qoder.sh" ;;
  hermes) exec bash "$script_dir/install-hermes.sh" ;;
  *)
    echo "不支持的客户端：$client（可选 codex、qoder、hermes）" >&2
    exit 1
    ;;
esac
