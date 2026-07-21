/** Low-token MCP tools for the Changyi Jiuan project profile. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectRuntime, type ProjectProfile } from "../../project/runtime.js";
import { PROJECT_VIEW_KINDS } from "../../project/views.js";

const recordFilters = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional();

function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return structuredContent
    ? { content: [{ type: "text" as const, text }], structuredContent }
    : { content: [{ type: "text" as const, text }] };
}

export function registerProjectTools(server: McpServer, runtime: ProjectRuntime, profile: Exclude<ProjectProfile, "upstream-full">): void {
  server.registerTool("kb_brief", {
    title: "Project Brief",
    description: "Return a compact, evidence-aware project brief. Use before broad searching.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { project_id: z.string(), max_tokens: z.number().min(100).max(1200).optional().default(600) },
  }, async ({ project_id }) => {
    const brief = await runtime.brief(project_id);
    return textResult(YAMLish(brief, 600), brief);
  });

  server.registerTool("kb_lookup", {
    title: "Structured Lookup",
    description: "Look up project records by type and exact structured fields. Returns IDs and requested metadata, not full documents.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { entity_type: z.string(), filters: recordFilters, limit: z.number().min(1).max(100).optional().default(20) },
  }, async ({ entity_type, filters, limit }) => {
    const records = await runtime.lookup(entity_type, filters ?? {}, limit);
    const rows = records.map(record => ({ id: record.id, type: record.type, title: record.title, status: record.status, project_id: record.project_id, uri: `kb://record/${encodeURIComponent(record.id)}` }));
    return textResult(rows.length ? rows.map(row => `${row.id} — ${row.title} (${row.status})`).join("\n") : "No matching records.", { records: rows });
  });

  server.registerTool("kb_search", {
    title: "Project Search",
    description: "Token-efficient lexical search over project records and accepted memory. Unverified memory stays hidden unless explicitly requested by an admin profile.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { query: z.string().min(1), top_k: z.number().min(1).max(20).optional().default(5), include_unverified: z.boolean().optional().default(false) },
  }, async ({ query, top_k, include_unverified }) => {
    if (include_unverified && profile !== "project-admin") return { content: [{ type: "text", text: "include_unverified requires project-admin." }], isError: true };
    const results = await runtime.search(query, top_k, include_unverified);
    const rows = results.map(item => ({ id: item.record.id, title: item.record.title, type: item.record.type, status: item.record.status, score: item.score, snippet: item.snippet, uri: `kb://record/${encodeURIComponent(item.record.id)}` }));
    return textResult(rows.length ? rows.map(row => `${row.id} [${row.score}] ${row.title}\n${row.snippet}`).join("\n\n") : "No results.", { results: rows });
  });

  server.registerTool("kb_outline", {
    title: "Project Resource Outline",
    description: "Return the smallest available outline for a kb:// project resource.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { resource_id: z.string() },
  }, async ({ resource_id }) => {
    try {
      const resource = await runtime.readResource(resource_id);
      const headings = resource.text.split("\n").filter(line => /^#{1,6}\s/.test(line)).map(line => line.trim());
      return textResult(headings.length ? headings.join("\n") : resource.title, { resource_id, title: resource.title, headings });
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  server.registerTool("kb_view", {
    title: "Project Structured View",
    description: "Rebuild a compact structured view from canonical Markdown records. This is read-only and never creates a second source of truth.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { project_id: z.string(), view: z.enum(PROJECT_VIEW_KINDS) },
  }, async ({ project_id, view }) => {
    const output = await runtime.view(project_id, view);
    return textResult(YAMLish(output, 800), output);
  });

  server.registerTool("kb_read", {
    title: "Read Project Resource",
    description: "Read a single project record or brief by stable kb:// URI. Never accepts filesystem paths.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { resource_id: z.string(), max_tokens: z.number().min(100).max(2000).optional().default(800) },
  }, async ({ resource_id, max_tokens }) => {
    try {
      const resource = await runtime.readResource(resource_id);
      const maxChars = max_tokens * 4;
      const text = resource.text.length > maxChars ? `${resource.text.slice(0, maxChars)}\n\n[TRUNCATED]` : resource.text;
      return { content: [{ type: "resource", resource: { uri: resource.uri, name: resource.title, title: resource.title, mimeType: "text/markdown", text } }] };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  if (profile === "project-read") return;

  server.registerTool("kb_start_work", {
    title: "Start Project Work",
    description: "Create a durable Agent work item. The service identity is supplied by the server profile, not by an untrusted document.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { project_id: z.string(), objective: z.string().min(3), expected_outputs: z.array(z.string()).min(1), acceptance_criteria: z.array(z.string()).min(1), input_refs: z.array(z.string()).optional() },
  }, async ({ project_id, objective, expected_outputs, acceptance_criteria, input_refs }) => {
    const result = await runtime.startWork({ project_id, objective, expected_outputs, acceptance_criteria, input_refs, actor: `agent:${profile}` });
    return textResult(`Started ${result.work_id}`, result);
  });

  server.registerTool("kb_finish_work", {
    title: "Finish Project Work",
    description: "Submit an idempotent closeout. Memory is promoted, quarantined, or rejected by server policy; callers cannot force acceptance.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      work_id: z.string(), outcome: z.enum(["completed", "partial", "failed", "cancelled"]), summary: z.string().min(1), result_hash: z.string().min(8),
      artifacts: z.array(z.string()).optional(), evidence_refs: z.array(z.string()).optional(), unresolved: z.array(z.string()).optional(),
      claims: z.array(z.object({ statement: z.string(), scope: z.string(), evidence_refs: z.array(z.string()).optional(), confidence: z.number().min(0).max(1).optional() })).optional(),
      decisions: z.array(z.object({ statement: z.string(), scope: z.string(), evidence_refs: z.array(z.string()).optional(), confidence: z.number().min(0).max(1).optional() })).optional(),
      lessons: z.array(z.object({ statement: z.string(), scope: z.string(), evidence_refs: z.array(z.string()).optional(), confidence: z.number().min(0).max(1).optional() })).optional(),
    },
  }, async (input) => {
    try {
      const result = await runtime.finishWork({ ...input, actor: `agent:${profile}` });
      return textResult(`Closeout ${result.work_status}; promoted=${result.promoted_memory_ids.length}, quarantined=${result.quarantined_memory_ids.length}, rejected=${result.rejected_memory_ids.length}`, result);
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  if (profile !== "project-admin") return;

  server.registerTool("kb_maintain", {
    title: "Project Health",
    description: "Return Agent-operable project runtime health. Phase 1 exposes health only; destructive maintenance is intentionally absent.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {},
  }, async () => {
    const health = await runtime.health();
    return textResult(YAMLish(health, 500), health);
  });
}

function YAMLish(value: unknown, maxChars: number): string {
  const text = JSON.stringify(value, null, 2);
  return text.length > maxChars * 4 ? `${text.slice(0, maxChars * 4)}\n[TRUNCATED]` : text;
}
