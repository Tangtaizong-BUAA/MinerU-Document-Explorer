import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MaintenanceQueue } from "../src/project/maintenance/queue.js";
import type { ChangePacket } from "../src/project/maintenance/contracts.js";

const cleanup: Array<{ root: string; queue: MaintenanceQueue }> = [];
afterEach(async () => { for (const item of cleanup.splice(0)) { item.queue.close(); await rm(item.root, { recursive: true, force: true }); } });

function packet(): ChangePacket { return {
  schema: "cyj-change-packet/v1", packet_id: "packet:queue", project_id: "project:cyj", idempotency_key: "queue-key", trigger: "work_finished",
  base_revisions: { knowledge_revision: "k", topology_revision: "t", index_revision: "i" }, evidence_refs: [], candidate_section_refs: [], open_conflict_refs: [], text_context: "x", media: [],
  budget: { max_tool_calls: 8, max_cumulative_input_tokens: 12000, max_context_tokens_per_step: 6000, max_cumulative_output_tokens: 3000, max_sections: 6, max_evidence_units: 40, max_multimodal_assets: 12, max_cost_usd: 1 },
  egress_policy: { maximum_confidentiality: "internal", provider: "alibaba_model_studio", region: "cn-beijing" },
}; }

describe("maintenance SQLite queue", () => {
  test("is idempotent and enforces lease ownership", async () => {
    const root = await mkdtemp(join(tmpdir(), "cyj-queue-")); const queue = new MaintenanceQueue(join(root, "jobs.sqlite")); cleanup.push({ root, queue });
    expect(await queue.enqueue(packet())).toEqual({ packet_id: "packet:queue", inserted: true });
    expect(await queue.enqueue(packet())).toEqual({ packet_id: "packet:queue", inserted: false });
    const leased = await queue.lease("worker:1");
    expect(leased).toMatchObject({ status: "leased", attempts: 1, lease_owner: "worker:1" });
    await expect(queue.complete("packet:queue", "worker:2")).rejects.toThrow("lease");
    await queue.complete("packet:queue", "worker:1");
    expect(await queue.get("packet:queue")).toMatchObject({ status: "completed" });
  });
});
