import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();

describe("Changyi Jiuan client deployment templates", () => {
  for (const name of ["codex", "qoder", "hermes"]) {
    test(`${name} uses the standard maintain-profile stdio contract`, async () => {
      const template = JSON.parse(await readFile(join(root, "deploy", "mcp", `${name}.mcp.json`), "utf8")) as Record<string, any>;
      const server = template.mcpServers?.["changyi-jiuan"];
      expect(server).toMatchObject({ command: "qmd", args: ["mcp"], env: { CYJ_MCP_PROFILE: "project-contribute" } });
      expect(server.env.CYJ_KB_ROOT).toBe("__ABSOLUTE_KNOWLEDGE_DATA_ROOT__");
    });
  }

  test("home maintenance image keeps MS-Agent on the verified lightweight runtime surface", async () => {
    const dockerfile = await readFile(join(root, "deploy", "home", "Dockerfile"), "utf8");
    const requirements = await readFile(join(root, "deploy", "home", "requirements.txt"), "utf8");
    const compose = await readFile(join(root, "deploy", "home", "compose.yaml"), "utf8");
    const agentConfig = await readFile(join(root, "src", "backends", "python", "cyj_maintenance_agent.yaml"), "utf8");

    expect(dockerfile).toContain("--no-deps --index-url \"$PIP_INDEX_URL\" ms-agent==1.6.0");
    expect(dockerfile).toContain("apt-get install -y --no-install-recommends build-essential");
    expect(dockerfile).toContain("build-essential libssl3");
    expect(dockerfile).toContain("apt-get purge -y --auto-remove build-essential");
    expect(dockerfile).toContain("ARG APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian");
    expect(requirements).not.toMatch(/^ms-agent(?:==|\s)/m);
    for (const forbidden of ["torch", "sentence-transformers", "faiss", "matplotlib", "pandas", "moviepy", "edge-tts"]) {
      expect(requirements.toLowerCase()).not.toContain(forbidden);
    }
    for (const required of ["mineru-open-sdk==0.2.5", "openai==1.109.1", "modelscope==1.31.0", "mcp==2.0.0", "Pillow==11.3.0"]) {
      expect(requirements).toContain(required);
    }
    const service = compose.split("  changyi-jiuan-maintainer:")[1] ?? "";
    expect(service).toContain("mem_limit: 384m");
    expect(service).toContain("memswap_limit: 768m");
    expect(service).not.toContain("mem_limit: 1536m");
    expect(agentConfig).toContain("enable_thinking: false");
    expect(agentConfig).toContain("max_tokens: 1200");
    expect(agentConfig).toContain("max_chat_round: 3");
  });

  test("Alibaba standby runs the same lightweight runtime in read-only profile", async () => {
    const unit = await readFile(join(root, "deploy", "systemd", "changyi-jiuan-mcp-standby.service"), "utf8");
    expect(unit).toContain("Environment=CYJ_MCP_PROFILE=project-read");
    expect(unit).toContain("Environment=CYJ_MCP_HOST=127.0.0.1");
    expect(unit).toContain("Environment=CYJ_MCP_PORT=8794");
    expect(unit).toContain("/opt/changyi-jiuan-mcp/current/dist/cli/project-mcp-http.js");
    expect(unit).not.toContain("dist/cli/qmd.js mcp");
    expect(unit).not.toContain("project-maintainer");
  });
});
