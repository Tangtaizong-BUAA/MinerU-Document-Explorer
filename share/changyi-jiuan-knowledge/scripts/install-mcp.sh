#!/usr/bin/env bash
set -euo pipefail

server_name="changyi_jiuan_knowledge"
server_url="https://argonai.cn/cyj/mcp"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
bundle_root="$(dirname "$script_dir")"
skill_name="changyi-jiuan-knowledge-operations"
skill_source="$bundle_root/skills/$skill_name"
codex_home="${CODEX_HOME:-$HOME/.codex}"
skill_target="$codex_home/skills/$skill_name"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI 未安装或不在 PATH 中。请先安装/启动 Codex 后重试。" >&2
  exit 1
fi

if [ ! -f "$skill_source/SKILL.md" ] || [ ! -f "$skill_source/agents/openai.yaml" ] || [ ! -f "$skill_source/skill-version.json" ]; then
  echo "安装包中的 Skill 不完整，未修改 Codex 配置。" >&2
  exit 1
fi

mkdir -p "$skill_target"
updated_files=0

install_skill_file() {
  local source_file="$1"
  local relative_path="${source_file#"$skill_source/"}"
  local target_file="$skill_target/$relative_path"
  if [[ "$relative_path" = /* || "$relative_path" = *".."* ]]; then
    echo "安装包包含不安全的 Skill 路径：$relative_path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$target_file")"
  if [ -f "$target_file" ] && cmp -s "$source_file" "$target_file"; then
    return
  fi
  local temporary_file="${target_file}.tmp.$$"
  cp "$source_file" "$temporary_file"
  mv "$temporary_file" "$target_file"
  updated_files=$((updated_files + 1))
}

while IFS= read -r -d '' source_file; do
  install_skill_file "$source_file"
done < <(find "$skill_source" -type f ! -name "skill-version.json" -print0)
install_skill_file "$skill_source/skill-version.json"
skill_version="$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version)' "$skill_source/skill-version.json")"

if codex mcp get "$server_name" >/dev/null 2>&1; then
  codex mcp remove "$server_name"
fi

codex mcp add "$server_name" --url "$server_url"
echo "已增量安装 Skill ${skill_version}：${skill_target}（更新 ${updated_files} 个文件）"
echo "已注册匿名维护入口 ${server_name}。请重启 Codex App，并在新任务中先调用 kb_sync_skill 验证版本。"
