#!/usr/bin/env bash
set -euo pipefail

server_name="changyi_jiuan_knowledge"
server_url="https://argonai.cn/cyj/mcp"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
bundle_root="$(dirname "$script_dir")"
skill_name="changyi-jiuan-knowledge-operations"
skill_source="$bundle_root/skills/$skill_name"
skill_target="$HOME/.qoder/skills/$skill_name"

if ! command -v node >/dev/null 2>&1; then
  echo "安装 Qoder MCP 配置需要 Node.js 来安全合并 JSON；未修改任何配置。" >&2
  exit 1
fi

token="${CYJ_MCP_BEARER_TOKEN:-}"
if [ -z "$token" ]; then
  printf "请输入个人 MCP 访问令牌（输入不会显示）: " >&2
  IFS= read -r -s token
  printf "\n" >&2
fi
token="${token#Bearer }"
if [ -z "$token" ]; then
  echo "未提供访问令牌，未进行任何配置。" >&2
  exit 1
fi

if [ ! -f "$skill_source/SKILL.md" ] || [ ! -f "$skill_source/skill-version.json" ]; then
  echo "安装包中的 Skill 不完整，未修改 Qoder 配置。" >&2
  exit 1
fi

mkdir -p "$skill_target"
while IFS= read -r -d '' source_file; do
  relative_path="${source_file#"$skill_source/"}"
  target_file="$skill_target/$relative_path"
  if [[ "$relative_path" = /* || "$relative_path" = *".."* ]]; then
    echo "安装包包含不安全的 Skill 路径：$relative_path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$target_file")"
  if [ ! -f "$target_file" ] || ! cmp -s "$source_file" "$target_file"; then
    temporary_file="${target_file}.tmp.$$"
    cp "$source_file" "$temporary_file"
    mv "$temporary_file" "$target_file"
  fi
done < <(find "$skill_source" -type f -print0)

config_paths=("$HOME/.qoder/settings.json")
desktop_config="$HOME/Library/Application Support/Qoder/SharedClientCache/mcp.json"
if [ "$(uname -s)" = "Darwin" ] && { [ -d "/Applications/Qoder.app" ] || [ -f "$desktop_config" ]; }; then
  config_paths+=("$desktop_config")
fi

for config_path in "${config_paths[@]}"; do
  mkdir -p "$(dirname "$config_path")"
  add_permissions="false"
  if [ "$config_path" = "$HOME/.qoder/settings.json" ]; then add_permissions="true"; fi
  CYJ_INSTALL_TOKEN="$token" node - "$config_path" "$server_name" "$server_url" "$add_permissions" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [configPath, serverName, serverUrl, addPermissions] = process.argv.slice(2);
let config = {};
if (fs.existsSync(configPath) && fs.readFileSync(configPath, "utf8").trim()) {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
}
config.mcpServers = config.mcpServers && typeof config.mcpServers === "object" ? config.mcpServers : {};
config.mcpServers[serverName] = {
  type: "http",
  url: serverUrl,
  headers: { Authorization: `Bearer ${process.env.CYJ_INSTALL_TOKEN}` },
};
if (addPermissions === "true") {
  config.permissions = config.permissions && typeof config.permissions === "object" ? config.permissions : {};
  const allow = Array.isArray(config.permissions.allow) ? config.permissions.allow : [];
  const rule = `mcp__${serverName}__*`;
  config.permissions.allow = allow.includes(rule) ? allow : [...allow, rule];
  config.permissions.deny = Array.isArray(config.permissions.deny) ? config.permissions.deny : [];
}
const temporary = `${configPath}.tmp.${process.pid}`;
fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporary, configPath);
fs.chmodSync(configPath, 0o600);
NODE
done

unset token CYJ_INSTALL_TOKEN
echo "已安装 Qoder Skill：$skill_target"
echo "已写入用户级 Qoder MCP 配置；本机配置权限为 0600。请重启 Qoder，或在 Qoder CLI 中执行 /mcp reload 与 /skills reload。"
