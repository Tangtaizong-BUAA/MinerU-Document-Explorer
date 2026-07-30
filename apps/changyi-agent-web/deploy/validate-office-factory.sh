#!/usr/bin/env bash
set -euo pipefail

credentials_file="${CYJ_AGENT_CREDENTIALS_FILE:-/root/changyi-agent-team-credentials.txt}"
base_url="${CYJ_AGENT_PUBLIC_URL:-https://argonai.cn/cyj/agent}"
username="$(sed -n 's/^username=//p' "$credentials_file")"
password="$(sed -n 's/^password=//p' "$credentials_file")"
response_file="$(mktemp)"
cleanup_files=("$response_file")
trap 'rm -f "${cleanup_files[@]}"' EXIT

payload='{"sessionId":"office-factory-acceptance-20260730","message":"请建立一个验收工作项，并生成三个简洁的可编辑验收文件：1）Word 文件《线上Agent多格式产物验收报告》，包含本次验收目的和 DOCX、PPTX、XLSX 三项通过清单；2）PowerPoint 文件《线上Agent多格式产物验收演示》，包含封面及两页核心能力；3）Excel 文件《线上Agent多格式产物验收清单》，包含格式、用途、状态三列和三行数据。三个文件都要持久化，然后完成工作收尾。不要生成 Markdown 代替。"}'

curl -fsS -N --max-time 300 \
  -u "$username:$password" \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  "$base_url/api/chat" \
  -o "$response_file"

cat "$response_file"
for extension in docx pptx xlsx; do
  grep -q "\\.${extension}" "$response_file"
done

artifact_count="$(grep -c '"type":"artifact"' "$response_file")"
test "$artifact_count" -eq 3

mapfile -t download_paths < <(sed -n 's/.*"downloadUrl":"\([^"]*\)".*/\1/p' "$response_file")
for index in "${!download_paths[@]}"; do
  output_file="$(mktemp)"
  cleanup_files+=("$output_file")
  curl -fsS -u "$username:$password" "https://argonai.cn${download_paths[$index]}" -o "$output_file"
  python3 -m zipfile -t "$output_file" >/dev/null
done

printf '\nartifact_count=%s\nooxml_downloads=ok\n' "$artifact_count"
