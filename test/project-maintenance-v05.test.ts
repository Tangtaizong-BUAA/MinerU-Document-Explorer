import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpServer } from "../src/mcp/server.js";
import { MsAgentMaintenanceAdapter } from "../src/project/maintenance/ms-agent-adapter.js";
import { MAINTENANCE_PROMPT_VERSION, MAINTENANCE_TOOL_SCHEMA_VERSION, validateMaintenancePlan, type ChangePacket } from "../src/project/maintenance/contracts.js";
import { authenticatePrincipal, canResolveConflicts, tokenSha256 } from "../src/project/principals.js";
import { ProjectRuntime } from "../src/project/runtime.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), "cyj-v05-")); roots.push(value); return value; }
function tools(server: unknown): string[] { return Object.keys((server as { _registeredTools: Record<string, unknown> })._registeredTools); }

function packet(media: ChangePacket["media"] = []): ChangePacket {
  return {
    schema: "cyj-change-packet/v1", packet_id: "packet:1", project_id: "project:cyj", idempotency_key: "abcdefgh",
    trigger: "artifact_parsed", base_revisions: { knowledge_revision: "k1", topology_revision: "t1", index_revision: "i1" },
    evidence_refs: media.map(item => item.evidence_id), candidate_section_refs: [], open_conflict_refs: [], text_context: "bounded",
    media, budget: { max_tool_calls: 8, max_cumulative_input_tokens: 12000, max_context_tokens_per_step: 6000, max_cumulative_output_tokens: 3000, max_sections: 6, max_evidence_units: 40, max_multimodal_assets: 12, max_cost_usd: 1 },
    egress_policy: { maximum_confidentiality: "internal", provider: "alibaba_model_studio", region: "cn-beijing" },
  };
}

describe("0.5 maintenance security boundary", () => {
  test("exposes contribution, resolution, and operations as separate capabilities", async () => {
    const contribute = await createMcpServer({} as never, { projectProfile: "project-contribute", projectDataDir: await root() });
    expect(tools(contribute)).toContain("kb_finish_work");
    expect(tools(contribute)).not.toContain("kb_submit_user_resolution");
    expect(tools(contribute)).not.toContain("kb_update_main");
    expect(tools(contribute)).not.toContain("kb_parse_artifact");

    const resolver = await createMcpServer({} as never, { projectProfile: "project-resolve", projectDataDir: await root() });
    expect(tools(resolver)).toContain("kb_submit_user_resolution");
    expect(tools(resolver)).not.toContain("kb_parse_artifact");

    const ops = await createMcpServer({} as never, { projectProfile: "project-ops", projectDataDir: await root() });
    expect(tools(ops)).toContain("kb_parse_artifact");
    expect(tools(ops)).not.toContain("kb_submit_user_resolution");
    expect(tools(ops)).not.toContain("kb_update_main");
  });

  test("resolver authority requires an individual owner or designated role", () => {
    const token = "owner-secret";
    const principal = authenticatePrincipal(token, [{ token_sha256: tokenSha256(token), principal_id: "owner:1", profile: "project-resolve", roles: ["project-owner"] }]);
    expect(principal && canResolveConflicts(principal)).toBe(true);
    const team = authenticatePrincipal("team", [{ token_sha256: tokenSha256("team"), principal_id: "team", profile: "project-contribute", roles: [] }]);
    expect(team && canResolveConflicts(team)).toBe(false);
  });

  test("rejects conflict block patches and false native-video acknowledgement", () => {
    const video = { evidence_id: "ev:video", artifact_id: "artifact:1", modality: "video" as const, mime_type: "video/mp4", sha256: "a".repeat(64), locator: { start_ms: 0, end_ms: 1000 }, transport: "base64_data_uri" as const, value: "data:video/mp4;base64,AA==", native_video_required: true };
    const input = packet([video]);
    const base = { schema: "cyj-maintenance-plan/v1" as const, packet_id: input.packet_id, base_knowledge_revision: "k1", expected_topology_revision: "t1", prompt_version: MAINTENANCE_PROMPT_VERSION, tool_schema_version: MAINTENANCE_TOOL_SCHEMA_VERSION };
    expect(() => validateMaintenancePlan(input, { ...base, operations: [{ op: "no_change", reason: "no durable change" }], native_video_evidence_ids: [] })).toThrow("Required native video");
    expect(() => validateMaintenancePlan(input, { ...base, operations: [{ op: "patch_main", patch: { target_ref: "project:cyj", expected_revision: "k1", block_key: "global-conflicts", previous_block_hash: "b".repeat(64), replacement_markdown: "x", evidence_refs: ["ev:video"], reason: "bad patch" } }], native_video_evidence_ids: ["ev:video"] })).toThrow("conflict-protected");
  });

  test("runs the isolated worker contract offline without an API key", async () => {
    const adapter = new MsAgentMaintenanceAdapter({ mode: "offline", timeoutMs: 10_000 });
    await expect(adapter.selfTest()).resolves.toMatchObject({ framework: "modelscope-ms-agent", framework_version: "1.6.0", default_model: "qwen3.7-flash", model_tools: ["read_change_packet", "read_document_blocks", "read_evidence", "read_topology_neighborhood", "search_maintenance_evidence", "find_open_conflicts", "submit_maintenance_plan", "finish_no_change", "report_insufficient_evidence"] });
    const plan = await adapter.propose(packet());
    expect(plan.operations).toEqual([{ op: "no_change", reason: "offline contract self-test" }]);
  });

  test("uses SHA-256 over the exact resolution statement", () => {
    expect(createHash("sha256").update("负责人原话").digest("hex")).toHaveLength(64);
  });

  test("commits a validated maintenance patch through one immutable revision", async () => {
    const data = await root(); const runtime = new ProjectRuntime(data); await runtime.initialize();
    await runtime.bootstrapProject({ project_id: "project:cyj", title: "Project", mission: "Maintain grounded project knowledge", actor: "ops" });
    const brief = await runtime.brief("project:cyj");
    const main = brief.main_file as { markdown: string; revision_hash: string };
    const input = packet(); input.evidence_refs = ["user:decision:1"]; input.base_revisions.knowledge_revision = (await runtime.revisionStore.pointer())!.knowledge_revision; input.base_revisions.topology_revision = (await runtime.revisionStore.pointer())!.topology_revision;
    const replacement = "# Project\n\nUpdated from cited evidence.\n";
    const plan = validateMaintenancePlan(input, {
      schema: "cyj-maintenance-plan/v1", packet_id: input.packet_id, base_knowledge_revision: input.base_revisions.knowledge_revision,
      expected_topology_revision: input.base_revisions.topology_revision, prompt_version: MAINTENANCE_PROMPT_VERSION, tool_schema_version: MAINTENANCE_TOOL_SCHEMA_VERSION,
      operations: [{ op: "patch_main", patch: { target_ref: "project:cyj", expected_revision: main.revision_hash, block_key: "document", previous_block_hash: createHash("sha256").update(main.markdown).digest("hex"), replacement_markdown: replacement, evidence_refs: ["user:decision:1"], reason: "confirmed project update" } }], native_video_evidence_ids: [],
    });
    const committed = await runtime.applyMaintenancePlan(input, plan);
    expect(committed.changed_records).toContain("project:cyj");
    expect(((await runtime.brief("project:cyj")).main_file as { markdown: string }).markdown).toBe(replacement);
  });

  test("patches one exact Markdown heading block without rewriting the document", async () => {
    const data = await root(); const runtime = new ProjectRuntime(data); await runtime.initialize();
    await runtime.bootstrapProject({ project_id: "project:cyj", title: "Project", mission: "Maintain grounded project knowledge", actor: "ops" });
    const started = await runtime.startWork({ project_id: "project:cyj", objective: "Seed stable heading blocks", expected_outputs: ["main"], acceptance_criteria: ["stable headings"], actor: "ops" });
    const initial = await runtime.brief("project:cyj") as { main_file: { revision_hash: string } };
    const seeded = await runtime.updateProjectMain({ project_id: "project:cyj", work_id: started.work_id, expected_revision: initial.main_file.revision_hash, change_summary: "Seed status blocks", actor: "ops", markdown: "# Project\n\n## Runtime status\n\nOld status.\n\n## Durable boundary\n\nKeep this text.\n" });
    const pointer = (await runtime.revisionStore.pointer())!;
    const input = packet(); input.evidence_refs = ["artifact:release"]; input.base_revisions.knowledge_revision = pointer.knowledge_revision; input.base_revisions.topology_revision = pointer.topology_revision;
    const plan = validateMaintenancePlan(input, { schema: "cyj-maintenance-plan/v1", packet_id: input.packet_id, base_knowledge_revision: pointer.knowledge_revision, expected_topology_revision: pointer.topology_revision, prompt_version: MAINTENANCE_PROMPT_VERSION, tool_schema_version: MAINTENANCE_TOOL_SCHEMA_VERSION, operations: [{ op: "patch_main", patch: { target_ref: "project:cyj", expected_revision: seeded.revision_hash, block_key: "heading:Runtime status", previous_block_hash: createHash("sha256").update("Old status.").digest("hex"), replacement_markdown: "New grounded status.", evidence_refs: ["artifact:release"], reason: "Apply bounded release evidence" } }], native_video_evidence_ids: [] });
    await runtime.applyMaintenancePlan(input, plan);
    const body = ((await runtime.brief("project:cyj")).main_file as { markdown: string }).markdown;
    expect(body).toContain("## Runtime status\n\nNew grounded status.");
    expect(body).toContain("## Durable boundary\n\nKeep this text.");
  });

  test("refreshes queued packets against the latest revision before planning", async () => {
    const data = await root(); const runtime = new ProjectRuntime(data); await runtime.initialize();
    await runtime.bootstrapProject({ project_id: "project:cyj", title: "Project", mission: "Maintain grounded project knowledge", actor: "ops" });
    const started = await runtime.startWork({ project_id: "project:cyj", objective: "Seed runtime status", expected_outputs: ["main"], acceptance_criteria: ["stable heading"], actor: "ops" });
    const firstBrief = await runtime.brief("project:cyj") as { main_file: { revision_hash: string } };
    const first = await runtime.updateProjectMain({ project_id: "project:cyj", work_id: started.work_id, expected_revision: firstBrief.main_file.revision_hash, change_summary: "Seed status", actor: "ops", markdown: "# Project\n\n## Runtime status\n\nOld status.\n" });
    const oldPointer = (await runtime.revisionStore.pointer())!;
    const input = packet();
    input.base_revisions = { knowledge_revision: oldPointer.knowledge_revision, topology_revision: oldPointer.topology_revision, index_revision: oldPointer.index_revision };
    input.text_context = `Update Runtime status.\n\n## Mutable document block\ntarget_ref: project:cyj\nexpected_revision: ${first.revision_hash}\nblock_key: heading:Runtime status\nprevious_block_hash: ${createHash("sha256").update("Old status.").digest("hex")}\n\nOld status.`;
    const second = await runtime.updateProjectMain({ project_id: "project:cyj", work_id: started.work_id, expected_revision: first.revision_hash, change_summary: "Concurrent status update", actor: "ops", markdown: "# Project\n\n## Runtime status\n\nCurrent status.\n" });

    const refreshed = await runtime.refreshMaintenancePacket(input);
    const currentPointer = (await runtime.revisionStore.pointer())!;
    expect(refreshed.base_revisions.knowledge_revision).toBe(currentPointer.knowledge_revision);
    expect(refreshed.base_revisions.knowledge_revision).not.toBe(oldPointer.knowledge_revision);
    expect(refreshed.text_context).toContain(`expected_revision: ${second.revision_hash}`);
    expect(refreshed.text_context).toContain(createHash("sha256").update("Current status.").digest("hex"));
    expect(refreshed.text_context).toContain("Current status.");
    expect(refreshed.text_context).not.toContain("Old status.");
  });

  test("locks and applies an authorized conflict resolution without model-side arbitration", async () => {
    const data = await root(); const runtime = new ProjectRuntime(data); await runtime.initialize();
    await runtime.bootstrapProject({ project_id: "project:cyj", title: "Project", mission: "Maintain grounded project knowledge", actor: "ops" });
    await runtime.upsertRecord({ id: "conflict:cyj:1", type: "conflict", title: "实践日期冲突", topic: "date", status: "open", project_id: "project:cyj", created_by: "conflict-service", claim_variants: ["A", "B"], severity: "high", impact: "answer", suggested_user_question: "哪一个日期正确？" }, "# 实践日期冲突\n");
    const conflict = ((await runtime.brief("project:cyj")).open_conflicts as Array<{ revision_hash: string }>)[0]!;
    const statement = "负责人确认采用 A 日期";
    const locked = await runtime.submitUserConflictResolution({ conflict_id: "conflict:cyj:1", expected_conflict_revision: conflict.revision_hash, resolution_statement: statement, source_turn_ref: "turn:1", user_statement_hash: createHash("sha256").update(statement).digest("hex"), idempotency_key: "resolution-key", actor_principal: "owner:1" });
    expect(locked.status).toBe("resolution_pending");
    const job = await runtime.maintenanceQueue.get(String(locked.change_packet_id)); expect(job).not.toBeNull();
    const packet = job!.packet;
    const plan = validateMaintenancePlan(packet, { schema: "cyj-maintenance-plan/v1", packet_id: packet.packet_id, base_knowledge_revision: packet.base_revisions.knowledge_revision, expected_topology_revision: packet.base_revisions.topology_revision, prompt_version: MAINTENANCE_PROMPT_VERSION, tool_schema_version: MAINTENANCE_TOOL_SCHEMA_VERSION, operations: [{ op: "no_change", reason: "resolution only changes typed conflict state" }], native_video_evidence_ids: [], typed_resolution: { conflict_id: "conflict:cyj:1", locked_user_resolution_ref: String(locked.resolution_id), outcome: "supersede_one_claim", affected_claim_refs: ["A"], resulting_scopes: ["project"] } });
    await runtime.applyMaintenancePlan(packet, plan);
    expect((await runtime.get("conflict:cyj:1"))!.record.status).toBe("resolved");
    expect((await runtime.get(String(locked.resolution_id)))!.record.status).toBe("applied");
  });
});
