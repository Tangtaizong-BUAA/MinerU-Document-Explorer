FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    CYJ_MCP_HOST=0.0.0.0 \
    CYJ_MCP_PORT=8793 \
    CYJ_PYTHON_BIN=/usr/bin/python3

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY requirements.txt ./
RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements.txt

COPY dist ./dist

USER node
EXPOSE 8793
CMD ["node", "dist/cli/project-mcp-http.js"]
