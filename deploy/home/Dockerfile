FROM python:3.11-slim-bookworm AS python-runtime

ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --no-cache-dir --index-url "$PIP_INDEX_URL" -r /tmp/requirements.txt
# MS-Agent's published dependency set includes local embedding, plotting, media,
# and training packages that this isolated DashScope tool loop never imports.
# Install the locked framework without those optional transitive dependencies;
# requirements.txt contains the complete runtime surface verified by the
# restricted-tool and live Qwen maintenance gates.
RUN python3 -m pip install --no-cache-dir --no-deps --index-url "$PIP_INDEX_URL" ms-agent==1.6.0

FROM node:22-bookworm-slim

ARG APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian
ENV NODE_ENV=production \
    CYJ_MCP_HOST=0.0.0.0 \
    CYJ_MCP_PORT=8793 \
    CYJ_PYTHON_BIN=/usr/local/bin/python3

COPY --from=python-runtime /usr/local /usr/local

WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 normally uses a prebuilt binary. Keep the image reproducible
# when that download is unavailable by compiling it, then remove the temporary
# toolchain in the same layer so it is absent from the runtime image.
RUN sed -i "s#http://deb.debian.org/debian#$APT_MIRROR#g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && npm ci --omit=dev --no-audit --no-fund \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/* /root/.cache/node-gyp

COPY dist ./dist

USER node
EXPOSE 8793
CMD ["node", "dist/cli/project-mcp-http.js"]
