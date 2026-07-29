import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { changePacketSchema, validateMaintenancePlan, type ChangePacket, type MaintenancePlan } from "./contracts.js";

export type MsAgentAdapterOptions = {
  pythonExecutable?: string;
  workerPath?: string;
  mode?: "offline" | "live";
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

function defaultWorkerPath(): string {
  return fileURLToPath(new URL("../../backends/python/cyj_maintenance_worker.py", import.meta.url));
}

export class MsAgentMaintenanceAdapter {
  readonly options: Required<Pick<MsAgentAdapterOptions, "pythonExecutable" | "workerPath" | "mode" | "timeoutMs">> & Omit<MsAgentAdapterOptions, "pythonExecutable" | "workerPath" | "mode" | "timeoutMs">;

  constructor(options: MsAgentAdapterOptions = {}) {
    this.options = {
      pythonExecutable: options.pythonExecutable ?? process.env.CYJ_MAINTENANCE_PYTHON ?? "python3",
      workerPath: options.workerPath ?? defaultWorkerPath(),
      mode: options.mode ?? "live",
      timeoutMs: options.timeoutMs ?? 120_000,
      model: options.model,
      baseUrl: options.baseUrl,
    };
  }

  async propose(packetInput: ChangePacket): Promise<MaintenancePlan> {
    const packet = changePacketSchema.parse(packetInput);
    const requestId = randomUUID();
    const response = await this.call({
      request_id: requestId,
      method: "propose",
      mode: this.options.mode,
      packet,
      options: { model: this.options.model, base_url: this.options.baseUrl },
    });
    if (response.request_id !== requestId || response.ok !== true) throw new Error(String(response.error ?? "Invalid MS-Agent worker response"));
    return validateMaintenancePlan(packet, response.result);
  }

  async selfTest(): Promise<Record<string, unknown>> {
    const requestId = randomUUID();
    const response = await this.call({ request_id: requestId, method: "self_test" });
    if (response.request_id !== requestId || response.ok !== true || !response.result || typeof response.result !== "object") throw new Error(String(response.error ?? "MS-Agent worker self-test failed"));
    return response.result as Record<string, unknown>;
  }

  private async call(request: unknown): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.pythonExecutable, [this.options.workerPath], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
      const output = createInterface({ input: child.stdout });
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("MS-Agent maintenance worker timed out"));
      }, this.options.timeoutMs);
      child.stderr.on("data", chunk => { stderr += String(chunk).slice(0, 4000); });
      output.once("line", line => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGTERM");
        try { resolve(JSON.parse(line) as Record<string, unknown>); }
        catch { reject(new Error(`Invalid MS-Agent worker JSON: ${line.slice(0, 500)}`)); }
      });
      child.once("error", error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
      child.once("exit", code => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`MS-Agent worker exited ${code}: ${stderr}`)); } });
      child.stdin.end(`${JSON.stringify(request)}\n`);
    });
  }
}
