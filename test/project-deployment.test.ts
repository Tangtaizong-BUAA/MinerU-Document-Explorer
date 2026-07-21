import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();

describe("Changyi Jiuan client deployment templates", () => {
  for (const name of ["codex", "qoder", "hermes"]) {
    test(`${name} uses the standard maintain-profile stdio contract`, async () => {
      const template = JSON.parse(await readFile(join(root, "deploy", "mcp", `${name}.mcp.json`), "utf8")) as Record<string, any>;
      const server = template.mcpServers?.["changyi-jiuan"];
      expect(server).toMatchObject({ command: "qmd", args: ["mcp"], env: { CYJ_MCP_PROFILE: "project-maintain" } });
      expect(server.env.CYJ_KB_ROOT).toBe("__ABSOLUTE_KNOWLEDGE_DATA_ROOT__");
    });
  }
});
