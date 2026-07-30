#!/usr/bin/env node

import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ProjectRuntime, resolveProjectRoot } from "../project/runtime.js";
import { MsAgentMaintenanceAdapter } from "../project/maintenance/ms-agent-adapter.js";

const root = resolveProjectRoot(process.env.CYJ_KB_ROOT);
if (!root) throw new Error("CYJ_KB_ROOT is required");
const runtime = new ProjectRuntime(root);
await runtime.initialize();
const adapter = new MsAgentMaintenanceAdapter({ mode: process.env.CYJ_MAINTENANCE_MODE === "offline" ? "offline" : "live", model: process.env.CYJ_MAINTENANCE_MODEL ?? "qwen3.7-flash" });
const owner = `maintenance-worker:${process.pid}`;
const once = process.argv.includes("--once");
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

do {
  const job = await runtime.maintenanceQueue.lease(owner);
  if (!job) {
    if (once) break;
    await delay(2_000);
    continue;
  }
  try {
    let applied = false;
    let lastError: unknown;
    for (let replan = 0; replan < 3; replan += 1) {
      const packet = await runtime.refreshMaintenancePacket(job.packet);
      try {
        const plan = await adapter.propose(packet);
        const committed = await runtime.applyMaintenancePlan(packet, plan, owner);
        const operations = plan.operations.map(operation => operation.op).join(",");
        const noChangeReason = plan.operations.length === 1 && plan.operations[0]?.op === "no_change" ? ` reason=${plan.operations[0].reason}` : "";
        console.log(`Maintenance packet ${job.packet.packet_id} completed operations=${operations} changed=${committed.changed_records.length}${noChangeReason}`);
        applied = true;
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!/base revision is stale|document revision conflict/i.test(message) || replan === 2) throw error;
        console.warn(`Maintenance packet ${job.packet.packet_id} will replan against the latest revision (${replan + 1}/2)`);
      }
    }
    if (!applied) throw lastError ?? new Error("Maintenance packet was not applied");
    await runtime.maintenanceQueue.complete(job.packet.packet_id, owner);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = /timeout|429|5\d\d|temporar|connection/i.test(message);
    await runtime.maintenanceQueue.fail(job.packet.packet_id, owner, message, retryable);
    console.error(`Maintenance packet ${job.packet.packet_id} failed: ${message}`);
  }
} while (!stopping);

runtime.maintenanceQueue.close();
