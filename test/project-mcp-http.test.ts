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

async function start(profile: "project-read" | "project-maintain" | "project-admin") {
  const root = await mkdtemp(join(tmpdir(), "cyj-mcp-http-"));
  roots.push(root);
  const server = await startMcpHttpServer(0, { quiet: true, dbPath: join(root, "qmd.sqlite"), projectProfile: profile, projectDataDir: join(root, "knowledge"), bearerToken: "" });
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
    const initializeBody = await initialize.json() as { result: { serverInfo: { name: string; version: string } } };
    expect(initializeBody.result.serverInfo).toEqual({ name: "changyi-jiuan-knowledge", version: "0.5.0" });
    const listed = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": session! },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    const result = await listed.json() as { result: { tools: Array<{ name: string; _meta?: Record<string, any> }> } };
    const names = result.result.tools.map(tool => tool.name);
    expect(names).toContain("kb_brief");
    expect(names).toContain("kb_sync_skill");
    expect(names).not.toContain("kb_start_work");
    expect(result.result.tools.find(tool => tool.name === "kb_brief")?._meta?.["cn.changyi-jiuan/client-contract"]?.required_skill?.version).toBe("0.5.0");

    const sync = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": session! },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "kb_sync_skill", arguments: { client: "codex", installed_version: "0.3.0" } } }),
    });
    const syncBody = await sync.json() as { result: { _meta: Record<string, any>; structuredContent: Record<string, any> } };
    expect(syncBody.result.structuredContent.status).toBe("update_required");
    expect(syncBody.result.structuredContent.delta.files.map((file: { path: string }) => file.path)).toContain("skill-version.json");
    expect(syncBody.result.structuredContent._client_contract.required_skill.version).toBe("0.5.0");
    expect(syncBody.result._meta["cn.changyi-jiuan/client-contract"].server_version).toBe("0.5.0");

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
    const names = result.result.tools.map(tool => tool.name);
    expect(names).toContain("kb_publish_resource");
    expect(names).toContain("kb_capture_context");
    expect(names).toContain("kb_finish_work");
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

  test("persists generated resources and distilled context through the HTTP MCP closeout", async () => {
    const server = await start("project-admin");
    const endpoint = `http://127.0.0.1:${server.port}/mcp`;
    const initialize = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "persistence-test", version: "1" } } }),
    });
    const session = initialize.headers.get("mcp-session-id")!;
    let requestId = 2;
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": session },
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId++, method: "tools/call", params: { name, arguments: args } }),
      });
      expect(response.status).toBe(200);
      return await response.json() as { result: { structuredContent: Record<string, unknown>; content: Array<{ text?: string }> } };
    };
    await call("kb_bootstrap_project", { project_id: "project:cyj:http-persistence", title: "HTTP persistence", mission: "Persist autonomous Agent project knowledge" });
    const started = await call("kb_start_work", { project_id: "project:cyj:http-persistence", objective: "Create a persistent report", expected_outputs: ["report"], acceptance_criteria: ["searchable"] });
    const workId = String(started.result.structuredContent.work_id);
    const finished = await call("kb_finish_work", {
      work_id: workId, outcome: "completed", summary: "Resource and context captured", result_hash: "http-persistence-001",
      generated_resources: [{ title: "Automatic closeout report", filename: "closeout.md", content_type: "text/markdown", encoding: "utf8", content: "# Automatic closeout artifact\n\nPersistent resource body.\n", kind: "report" }],
      knowledge_updates: [{ kind: "constraint", statement: "Project Agents must persist durable outputs through MCP", scope: "http-persistence-policy", evidence_refs: ["user:conversation:http-test"], confidence: 1 }],
    });
    expect(finished.result.structuredContent.published_resources).toHaveLength(1);
    expect(finished.result.structuredContent.promoted_memory_ids).toHaveLength(1);
    const searched = await call("kb_search", { query: "Automatic closeout artifact", top_k: 3 });
    expect(searched.result.content[0]!.text).toContain("Automatic closeout report");

    const binaryWork = await call("kb_start_work", { project_id: "project:cyj:http-persistence", objective: "Verify binary resource download", expected_outputs: ["binary"], acceptance_criteria: ["raw bytes round trip"] });
    const binary = await call("kb_publish_resource", {
      work_id: String(binaryWork.result.structuredContent.work_id),
      resource: { title: "Synthetic binary", filename: "synthetic.pdf", content_type: "application/pdf", encoding: "base64", content: Buffer.from("%PDF-http-test").toString("base64"), kind: "document" },
    });
    const rawUri = String(binary.result.structuredContent.raw_resource_uri);
    const read = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": session },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId++, method: "resources/read", params: { uri: rawUri } }),
    });
    expect(read.status).toBe(200);
    const readBody = await read.json() as { result: { contents: Array<{ mimeType?: string; blob?: string }> } };
    expect(readBody.result.contents[0]!.mimeType).toBe("application/pdf");
    expect(Buffer.from(readBody.result.contents[0]!.blob!, "base64").toString("utf8")).toBe("%PDF-http-test");

    const chunkedBytes = Buffer.from("chunked-resource-round-trip");
    const chunkedWork = await call("kb_start_work", { project_id: "project:cyj:http-persistence", objective: "Verify chunked resource upload", expected_outputs: ["chunked"], acceptance_criteria: ["ordered chunks round trip"] });
    const begun = await call("kb_begin_resource_upload", {
      work_id: String(chunkedWork.result.structuredContent.work_id), title: "Chunked resource", filename: "chunked.pdf", content_type: "application/pdf", kind: "document",
      expected_size: chunkedBytes.length, expected_sha256: (await import("node:crypto")).createHash("sha256").update(chunkedBytes).digest("hex"),
    });
    const uploadId = String(begun.result.structuredContent.upload_id);
    await call("kb_append_resource_chunk", { upload_id: uploadId, offset: 0, content_base64: chunkedBytes.subarray(0, 8).toString("base64") });
    await call("kb_append_resource_chunk", { upload_id: uploadId, offset: 8, content_base64: chunkedBytes.subarray(8).toString("base64") });
    const committed = await call("kb_commit_resource_upload", { upload_id: uploadId });
    expect(committed.result.structuredContent.size_bytes).toBe(chunkedBytes.length);
  });

  test("keeps legacy main and section tools proposal-only over HTTP", async () => {
    const server = await start("project-admin");
    const endpoint = `http://127.0.0.1:${server.port}/mcp`;
    const initialize = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "graph-test", version: "1" } } }),
    });
    const session = initialize.headers.get("mcp-session-id")!;
    let requestId = 2;
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": session },
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId++, method: "tools/call", params: { name, arguments: args } }),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as { result: { isError?: boolean; structuredContent: Record<string, any>; content: Array<Record<string, any>> } };
      expect(body.result.isError).not.toBe(true);
      return body;
    };
    const projectId = "project:cyj:http-graph";
    await call("kb_bootstrap_project", { project_id: projectId, title: "HTTP graph", mission: "Maintain main sections and linked artifact retrieval" });
    const started = await call("kb_start_work", { project_id: projectId, objective: "Build maintained knowledge hierarchy", expected_outputs: ["main", "section"], acceptance_criteria: ["linked artifact returned"] });
    const workId = started.result.structuredContent.work_id;
    const initial = await call("kb_brief", { project_id: projectId });
    const initialRevision = initial.result.structuredContent.main_file.revision_hash;
    const mainMarkdown = "# HTTP Graph Main\n\nComplete project orientation.\n\n## Navigation\n\nUse the field section.\n";
    const mainProposal = await call("kb_update_main", { project_id: projectId, work_id: workId, markdown: mainMarkdown, expected_revision: initialRevision, change_summary: "Create main navigation" });
    expect(mainProposal.result.structuredContent).toMatchObject({ status: "queued", migration_required: true });
    const published = await call("kb_publish_resource", {
      work_id: workId,
      resource: { title: "Field evidence", filename: "field.md", content_type: "text/markdown", encoding: "utf8", content: "# Field Evidence\n\nThe verified rendezvous is North Gate.\n", kind: "document" },
    });
    const artifactId = published.result.structuredContent.artifact_id;
    const section = await call("kb_upsert_section", {
      project_id: projectId, work_id: workId, key: "field", title: "Field", summary: "Maintained field execution details",
      markdown: "# Field\n\nUse linked evidence for exact rendezvous details.\n", change_summary: "Create field section", artifact_refs: [artifactId],
    });
    expect(section.result.structuredContent).toMatchObject({ status: "queued", migration_required: true });
    const brief = await call("kb_brief", { project_id: projectId });
    expect(brief.result.content[0]!.text).not.toContain(mainMarkdown.trim());
    expect(brief.result.structuredContent.navigation.sections).toEqual([]);
    const searched = await call("kb_search", { query: "verified rendezvous", top_k: 5 });
    expect(searched.result.structuredContent.results.some((item: { id: string }) => item.id === artifactId)).toBe(true);
    await call("kb_finish_work", { work_id: workId, outcome: "completed", summary: "Hierarchy verified", result_hash: "http-graph-closeout-001", artifacts: [artifactId] });
  });
});
