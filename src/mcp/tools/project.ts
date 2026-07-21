/** Low-token MCP tools for the Changyi Jiuan project profile. */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectRuntime, type ProjectProfile } from "../../project/runtime.js";
import { PROJECT_VIEW_KINDS } from "../../project/views.js";

const recordFilters = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional();
const visibleTo = (record: { confidentiality?: unknown }, profile: ProjectProfile) => profile === "project-admin" || record.confidentiality !== "restricted" && record.confidentiality !== "secret";
const maximumConfidentiality = (profile: ProjectProfile) => profile === "project-admin" ? "secret" as const : "internal" as const;

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
    const records = (await runtime.lookup(entity_type, filters ?? {}, limit)).filter(record => visibleTo(record, profile));
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
    const results = (await runtime.search(query, top_k, include_unverified)).filter(item => visibleTo(item.record, profile));
    const rows = results.map(item => {
      const base = { id: item.record.id, title: item.record.title, type: item.record.type, status: item.record.status, score: item.score, snippet: item.snippet, uri: `kb://record/${encodeURIComponent(item.record.id)}` };
      const withVisual = item.visual_context?.length ? { ...base, visual_context: item.visual_context } : base;
      return withVisual;
    });
    const textParts = rows.map(row => {
      const visualHint = "visual_context" in row && Array.isArray(row.visual_context) && row.visual_context.length > 0
        ? `\n[visual: ${row.visual_context.map((vc: { alt_text?: string; resource_uri: string }) => vc.alt_text ?? vc.resource_uri).join(", ")}]`
        : "";
      return `${row.id} [${row.score}] ${row.title}\n${row.snippet}${visualHint}`;
    });
    return textResult(textParts.length ? textParts.join("\n\n") : "No results.", { results: rows });
  });

  server.registerTool("kb_outline", {
    title: "Project Resource Outline",
    description: "Return the smallest available outline for a kb:// project resource.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { resource_id: z.string() },
  }, async ({ resource_id }) => {
    try {
      const resource = await runtime.readResource(resource_id, maximumConfidentiality(profile));
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
      const resource = await runtime.readResource(resource_id, maximumConfidentiality(profile));
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

  server.registerTool("kb_bootstrap_project", {
    title: "Bootstrap Project Knowledge Root",
    description: "Create the canonical project record and durable project directories once. Repeated calls with the same project ID are idempotent.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { project_id: z.string().min(6), title: z.string().min(2), mission: z.string().min(8) },
  }, async (input) => {
    try {
      const output = await runtime.bootstrapProject({ ...input, actor: `agent:${profile}` });
      return textResult(`Project ${output.project_id} ${output.created ? "created" : "already exists"}.`, output);
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  server.registerTool("kb_configure_source_root", {
    title: "Configure a Safe Project Source Root",
    description: "Configure a dedicated source directory relative to CYJ_KB_ROOT. Absolute paths and the project root itself are forbidden.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { id: z.string().min(3), project_id: z.string().min(6), relative_path: z.string().min(1) },
  }, async (input) => {
    try {
      const output = await runtime.configureSourceRoot({ ...input, actor: `agent:${profile}` });
      return textResult(`Configured source root ${output.id}.`, output);
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  server.registerTool("kb_ingest", {
    title: "Inventory or Register Project Sources",
    description: "Perform local inventory or idempotent artifact registration from a preconfigured source root. Paths are never accepted from callers.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { source_root_id: z.string(), mode: z.enum(["inventory", "ingest"]) },
  }, async ({ source_root_id, mode }) => {
    try {
      if (mode === "inventory") {
        const inventory = await runtime.inventory(source_root_id);
        const output = { source_root_id, project_id: inventory.project_id, file_count: inventory.files.length, files: inventory.files };
        return textResult(YAMLish(output, 1000), output);
      }
      const output = await runtime.ingestInventory(source_root_id, `agent:${profile}`);
      return textResult(`Registered ${output.registered_artifact_ids.length} artifact(s); ${output.unchanged_artifact_ids.length} unchanged.`, output);
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  server.registerTool("kb_parse_artifact", {
    title: "Parse Registered Document with MinerU API",
    description: "Send one registered PDF, image, Office, or spreadsheet artifact to MinerU API, write normalized Markdown and a parse report, and append an egress audit event. Requires configured MinerU credentials.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: { artifact_id: z.string() },
  }, async ({ artifact_id }) => {
    try {
      const output = await runtime.parseArtifactWithMinerU(artifact_id, `agent:${profile}`);
      return textResult(`Artifact ${output.artifact_id}: ${output.status}`, output);
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  server.registerTool("kb_reconcile_memory", {
    title: "Reconcile Quarantined or Disputed Memory",
    description: "Supply evidence, narrow scope, propose a supersession, or revalidate a memory. The policy engine alone decides the final status.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      memory_id: z.string(), action: z.enum(["add_evidence", "narrow_scope", "propose_supersession", "revalidate"]), rationale: z.string().min(3),
      evidence_refs: z.array(z.string()).optional(), narrowed_scope: z.string().optional(), proposed_supersedes: z.string().optional(),
    },
  }, async (input) => {
    try {
      const output = await runtime.reconcileMemory({ ...input, actor: `agent:${profile}` });
      return textResult(`Memory ${output.memory_id}: ${output.status}`, output);
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  });

  server.registerTool("kb_maintain", {
    title: "Project Maintenance",
    description: "Run health, lint, dry-run retry planning, or execute retry of failed MinerU parses. Original files and accepted audit history are never deleted.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: { action: z.enum(["health", "lint", "retry_failed_parses"]), dry_run: z.boolean().optional().default(true), limit: z.number().min(1).max(20).optional().default(20) },
  }, async ({ action, dry_run, limit }) => {
    if (action === "health") {
      const output = await runtime.health();
      return textResult(YAMLish(output, 500), output);
    }
    if (action === "lint") {
      const issues = await runtime.lint();
      return textResult(YAMLish({ issue_count: issues.length, issues }, 800), { issue_count: issues.length, issues });
    }
    const pending = (await runtime.lookup("artifact", { status: "failed" }, limit)).map(record => record.id);
    if (dry_run) return textResult(`Would retry ${pending.length} failed MinerU parse(s).`, { dry_run: true, artifact_ids: pending });
    const output = await runtime.retryFailedParses(`agent:${profile}`, limit);
    return textResult(`Retried ${output.attempted.length} parse(s); parsed=${output.parsed.length}, failed=${output.failed.length}.`, output);
  });
}

function YAMLish(value: unknown, maxChars: number): string {
  const text = JSON.stringify(value, null, 2);
  return text.length > maxChars * 4 ? `${text.slice(0, maxChars * 4)}\n[TRUNCATED]` : text;
}
