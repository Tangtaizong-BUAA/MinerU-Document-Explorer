#!/usr/bin/env node

import { startLightweightProjectHttpServer } from "../mcp/project-http-server.js";

const port = Number(process.env.CYJ_MCP_PORT ?? "8793");
const host = process.env.CYJ_MCP_HOST ?? "127.0.0.1";
// Deliberately opt-in: an unset, misspelled, or truthy-looking value must not
// accidentally turn a protected endpoint into an anonymous write endpoint.
const allowUnauthenticated = process.env.CYJ_MCP_ALLOW_UNAUTHENTICATED === "true";

const handle = await startLightweightProjectHttpServer({ host, port, allowUnauthenticated });

async function shutdown(signal: string): Promise<void> {
  console.error(`Shutting down lightweight project MCP (${signal})`);
  await handle.stop();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
