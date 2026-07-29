import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLightweightProjectHttpServer, type LightweightProjectHttpHandle } from "../src/mcp/project-http-server.js";

const roots: string[] = [];
const servers: LightweightProjectHttpHandle[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.stop()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function start(profile: "project-read" | "project-admin") {
  const root = await mkdtemp(join(tmpdir(), "cyj-lightweight-http-"));
  roots.push(root);
  const server = await startLightweightProjectHttpServer({
    host: "127.0.0.1",
    port: 0,
    projectProfile: profile,
    projectDataDir: root,
    bearerToken: "test-token",
    quiet: true,
  });
  servers.push(server);
  return server;
}

async function initialize(server: LightweightProjectHttpHandle) {
  const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lightweight-test", version: "1" } },
    }),
  });
  return { response, session: response.headers.get("mcp-session-id") };
}

describe("lightweight project-only HTTP MCP", () => {
  test("requires bearer auth and reports bounded runtime health", async () => {
    const server = await start("project-admin");
    const endpoint = `http://127.0.0.1:${server.port}`;
    const health = await fetch(`${endpoint}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", role: "project-admin", version: "0.4.0", sessions: 0 });

    const denied = await fetch(`${endpoint}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(denied.status).toBe(401);
  });

  test("exposes the complete project-admin tool profile without the full QMD server", async () => {
    const server = await start("project-admin");
    const { response, session } = await initialize(server);
    expect(response.status).toBe(200);
    expect(session).toBeTruthy();
    const initialized = await response.json() as { result: { serverInfo: { name: string; version: string } } };
    expect(initialized.result.serverInfo).toEqual({ name: "changyi-jiuan-knowledge", version: "0.4.0" });

    const listed = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": session!,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(listed.status).toBe(200);
    const body = await listed.json() as { result: { tools: Array<{ name: string }> } };
    const names = body.result.tools.map(tool => tool.name);
    expect(names).toContain("kb_sync_skill");
    expect(names).toContain("kb_search");
    expect(names).toContain("kb_finish_work");
    expect(names).toContain("kb_parse_artifact");
  });

  test("keeps the standby profile read-only", async () => {
    const server = await start("project-read");
    const { response, session } = await initialize(server);
    expect(response.status).toBe(200);
    const listed = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": session!,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    const body = await listed.json() as { result: { tools: Array<{ name: string }> } };
    const names = body.result.tools.map(tool => tool.name);
    expect(names).toContain("kb_brief");
    expect(names).not.toContain("kb_start_work");
    expect(names).not.toContain("kb_parse_artifact");
  });
});
