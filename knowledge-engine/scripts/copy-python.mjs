import { cpSync, chmodSync } from "node:fs";
cpSync("src/backends/python", "dist/backends/python", { recursive: true });
chmodSync("bin/knowledge-mcp", 0o755);
