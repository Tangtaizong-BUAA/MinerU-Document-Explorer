#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/build/changyi-jiuan-lightweight-mcp}"

cd "$ROOT_DIR"
npm run build

rm -rf "$OUTPUT_DIR"
install -d "$OUTPUT_DIR/dist/cli" "$OUTPUT_DIR/dist/mcp/tools" "$OUTPUT_DIR/dist/backends/python"
cp deploy/home/Dockerfile deploy/home/package.json deploy/home/package-lock.json deploy/home/requirements.txt "$OUTPUT_DIR/"
cp dist/cli/project-mcp-http.js dist/cli/project-maintainer.js "$OUTPUT_DIR/dist/cli/"
cp dist/mcp/project-http-server.js dist/mcp/project-resource.js dist/mcp/project-versioning.js "$OUTPUT_DIR/dist/mcp/"
cp dist/mcp/tools/project.js "$OUTPUT_DIR/dist/mcp/tools/"
cp -R dist/project "$OUTPUT_DIR/dist/"
cp dist/doc-reading-config.js "$OUTPUT_DIR/dist/"
cp dist/backends/python-utils.js dist/backends/python-types.js "$OUTPUT_DIR/dist/backends/"
cp -R dist/backends/python/. "$OUTPUT_DIR/dist/backends/python/"
find "$OUTPUT_DIR" -type d -name __pycache__ -prune -exec rm -rf {} +
find "$OUTPUT_DIR" -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete

(
  cd "$OUTPUT_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
)

printf 'Packaged lightweight MCP runtime at %s\n' "$OUTPUT_DIR"
