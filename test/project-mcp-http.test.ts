import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMcpHttpServer, type HttpServerHandle } from "../src/mcp/server.js";

const roots: string[] = [];
const servers: HttpServerHandle[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.stop()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function start(profile: "project-read" | "project-maintain") {
  const root = await mkdtemp(join(tmpdir(), "cyj-mcp-http-"));
  roots.push(root);
  const server = await startMcpHttpServer(0, { quiet: true, dbPath: join(root, "qmd.sqlite"), projectProfile: profile, projectDataDir: join(root, "knowledge") });
  servers.push(server);
  return server;
}

describe("Changyi Jiuan HTTP MCP", () => {
  test("performs standard discovery while denying legacy REST query access", async () => {
    const server = await start("project-read");
    const endpoint = `http://127.0.0.1:${server.port}/mcp`;
    const initialize = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
    });
    expect(initialize.status).toBe(200);
    const session = initialize.headers.get("mcp-session-id");
    expect(session).toBeTruthy();
    const listed = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": session! },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    const result = await listed.json() as { result: { tools: Array<{ name: string }> } };
    const names = result.result.tools.map(tool => tool.name);
    expect(names).toContain("kb_brief");
    expect(names).not.toContain("kb_start_work");

    const legacy = await fetch(`http://127.0.0.1:${server.port}/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ searches: [] }) });
    expect(legacy.status).toBe(404);
  });

  test("adds lifecycle tools only to the maintain profile", async () => {
    const server = await start("project-maintain");
    const endpoint = `http://127.0.0.1:${server.port}/mcp`;
    const initialize = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }) });
    const session = initialize.headers.get("mcp-session-id");
    const listed = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": session! }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) });
    const result = await listed.json() as { result: { tools: Array<{ name: string }> } };
    expect(result.result.tools.map(tool => tool.name)).toContain("kb_finish_work");
  });

  test("requires a configured bearer token before creating an MCP session", async () => {
    const root = await mkdtemp(join(tmpdir(), "cyj-mcp-http-auth-"));
    roots.push(root);
    const server = await startMcpHttpServer(0, { quiet: true, dbPath: join(root, "qmd.sqlite"), projectProfile: "project-read", projectDataDir: join(root, "knowledge"), bearerToken: "test-token" });
    servers.push(server);
    const endpoint = `http://127.0.0.1:${server.port}/mcp`;
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    const denied = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
    expect(denied.status).toBe(401);
    const accepted = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer test-token" }, body: payload });
    expect(accepted.status).toBe(200);
  });
});
