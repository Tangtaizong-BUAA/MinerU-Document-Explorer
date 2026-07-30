#!/usr/bin/env bash
set -euo pipefail

server_name="changyi_jiuan_knowledge"
server_url="https://argonai.cn/cyj/mcp"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
bundle_root="$(dirname "$script_dir")"
skill_name="changyi-jiuan-knowledge-operations"
skill_source="$bundle_root/skills/$skill_name"
skill_target="$HOME/.hermes/skills/$skill_name"

if ! command -v hermes >/dev/null 2>&1; then
  echo "Hermes CLI 未安装或不在 PATH 中；未修改任何配置。" >&2
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

if hermes mcp list 2>/dev/null | grep -q "$server_name"; then
  echo "Hermes 中已存在 $server_name；已更新 Skill。"
else
  hermes mcp add "$server_name" --url "$server_url"
fi

hermes mcp test "$server_name"
echo "已安装 Hermes Skill：$skill_target"
echo "Hermes 匿名维护入口已验证；新会话会自动发现 Skill 和 MCP 工具。"
