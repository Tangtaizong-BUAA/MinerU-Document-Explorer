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
    const plan = await adapter.propose(job.packet);
    await runtime.applyMaintenancePlan(job.packet, plan, owner);
    await runtime.maintenanceQueue.complete(job.packet.packet_id, owner);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = /timeout|429|5\d\d|temporar|connection/i.test(message);
    await runtime.maintenanceQueue.fail(job.packet.packet_id, owner, message, retryable);
    console.error(`Maintenance packet ${job.packet.packet_id} failed: ${message}`);
  }
} while (!stopping);

runtime.maintenanceQueue.close();
