import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectProfile, ProjectRuntime } from "../project/runtime.js";

/** Register only the kb:// resource namespace, without loading the full QMD stack. */
export function registerLightweightProjectResource(
  server: McpServer,
  runtime: ProjectRuntime,
  profile: Exclude<ProjectProfile, "upstream-full">,
): void {
  server.registerResource(
    "project-record",
    new ResourceTemplate("kb://{+path}", { list: undefined }),
    {
      title: "Changyi Jiuan knowledge record",
      description: "A project main file, maintained section, memory, record, or linked artifact discovered through project MCP tools.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      if (uri.pathname.endsWith("/raw")) {
        const resource = await runtime.readRawArtifactResource(uri.href, profile === "project-admin" ? "secret" : "internal");
        return {
          contents: [{
            uri: uri.href,
            name: resource.title,
            title: resource.title,
            mimeType: resource.mimeType,
            blob: resource.blob,
          }],
        };
      }
      const resource = await runtime.readResource(uri.href, profile === "project-admin" ? "secret" : "internal");
      return {
        contents: [{
          uri: uri.href,
          name: resource.title,
          title: resource.title,
          mimeType: "text/markdown",
          text: resource.text,
        }],
      };
    },
  );
}
