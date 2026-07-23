#!/usr/bin/env bash
set -euo pipefail

server_name="changyi_jiuan_knowledge"
server_url="https://argonai.cn/cyj/mcp"
token_env="CYJ_MCP_BEARER_TOKEN"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI 未安装或不在 PATH 中。请先安装/启动 Codex 后重试。" >&2
  exit 1
fi

token="${CYJ_MCP_BEARER_TOKEN:-}"
if [ -z "$token" ]; then
  printf "请输入团队 MCP 访问令牌（输入不会显示）: " >&2
  IFS= read -r -s token
  printf "\n" >&2
fi

if [ -z "$token" ]; then
  echo "未提供访问令牌，未进行任何配置。" >&2
  exit 1
fi

if [ "$(uname -s)" = "Darwin" ]; then
  launchctl setenv "$token_env" "$token"
else
  export "$token_env=$token"
  echo "已设置当前终端环境变量。请按你的 Linux 桌面环境配置持久化环境变量后重启 Codex。" >&2
fi

if codex mcp get "$server_name" >/dev/null 2>&1; then
  codex mcp remove "$server_name"
fi

codex mcp add "$server_name" --url "$server_url" --bearer-token-env-var "$token_env"
echo "已注册 $server_name。请重启 Codex App，并在新任务中先调用 kb_brief 验证访问。"
