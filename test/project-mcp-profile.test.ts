import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpServer } from "../src/mcp/server.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cyj-mcp-"));
  roots.push(root);
  return root;
}

function toolNames(server: unknown): string[] {
  return Object.keys((server as { _registeredTools: Record<string, unknown> })._registeredTools).sort();
}

function resourceTemplateNames(server: unknown): string[] {
  return Object.keys((server as { _registeredResourceTemplates: Record<string, unknown> })._registeredResourceTemplates).sort();
}

describe("Changyi Jiuan MCP profiles", () => {
  it("keeps the read profile narrow and registers the kb resource namespace", async () => {
    const server = await createMcpServer({} as never, {
      projectProfile: "project-read",
      projectDataDir: await projectRoot(),
    });

    expect(toolNames(server)).toEqual(["kb_brief", "kb_graph_context", "kb_lookup", "kb_outline", "kb_read", "kb_search", "kb_sync_skill", "kb_view"]);
    expect(resourceTemplateNames(server)).toEqual(["project-record"]);
  });

  it("exposes closeout operations only to a maintenance profile", async () => {
    const server = await createMcpServer({} as never, {
      projectProfile: "project-maintain",
      projectDataDir: await projectRoot(),
    });

    expect(toolNames(server)).toContain("kb_start_work");
    expect(toolNames(server)).toContain("kb_sync_skill");
    expect(toolNames(server)).toContain("kb_publish_resource");
    expect(toolNames(server)).toContain("kb_capture_context");
    expect(toolNames(server)).toContain("kb_update_main");
    expect(toolNames(server)).toContain("kb_upsert_section");
    expect(toolNames(server)).toContain("kb_finish_work");
    expect(toolNames(server)).not.toContain("query");
  });

  it("reserves source ingestion for the admin profile", async () => {
    const server = await createMcpServer({} as never, {
      projectProfile: "project-admin",
      projectDataDir: await projectRoot(),
    });

    expect(toolNames(server)).toContain("kb_ingest");
    expect(toolNames(server)).toContain("kb_parse_artifact");
    expect(toolNames(server)).toContain("kb_reconcile_memory");
    expect(toolNames(server)).toContain("kb_bootstrap_project");
    expect(toolNames(server)).toContain("kb_configure_source_root");
    expect(toolNames(server)).toContain("kb_maintain");
  });
});
