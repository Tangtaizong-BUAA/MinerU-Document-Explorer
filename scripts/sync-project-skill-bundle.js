#!/usr/bin/env node
/**
 * Build the authenticated, declarative client Skill bundle exposed by the
 * Changyi Jiuan MCP server. The generated module is committed so tests and
 * production builds use the same bytes.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const plugin = JSON.parse(readFileSync("share/changyi-jiuan-knowledge/.codex-plugin/plugin.json", "utf8"));
const version = String(plugin.version);
const skillName = "changyi-jiuan-knowledge-operations";
const skillRoot = `share/changyi-jiuan-knowledge/skills/${skillName}`;
const managedPaths = ["SKILL.md", "agents/openai.yaml", "references/mcp-workflow.md"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const files = managedPaths.map((path) => {
  const content = readFileSync(`${skillRoot}/${path}`, "utf8");
  return { path, content, sha256: sha256(content), size_bytes: Buffer.byteLength(content) };
});
const fileHashes = Object.fromEntries(files.map((file) => [file.path, file.sha256]));
const bundleSha256 = sha256(JSON.stringify(fileHashes));
const manifest = {
  schema: "cyj-skill-manifest/v1",
  skill_name: skillName,
  version,
  bundle_sha256: bundleSha256,
  files: fileHashes,
};
writeFileSync(`${skillRoot}/skill-version.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const legacyReleases = {
  "0.3.0": {
    "SKILL.md": "2e85dd36455a71988d4acd4b82dc881dbdd26de6eab32b93e8cb6f5f1fbe8f8e",
    "agents/openai.yaml": "091b13700bb0410e2b6bb9d81493b5216e8c6c49190e107af36bba2e18a60141",
  },
};

const encodedFiles = files.map((file) => ({ ...file, content_base64: Buffer.from(file.content).toString("base64") }));
const generated = `// Auto-generated — do not edit manually. Run: node scripts/sync-project-skill-bundle.js

export const PROJECT_MCP_SERVER_VERSION = ${JSON.stringify(version)};
export const PROJECT_SKILL_NAME = ${JSON.stringify(skillName)};
export const PROJECT_SKILL_VERSION = ${JSON.stringify(version)};
export const PROJECT_SKILL_BUNDLE_SHA256 = ${JSON.stringify(bundleSha256)};

export type ProjectSkillFile = {
  path: string;
  content: string;
  sha256: string;
  size_bytes: number;
};

const PROJECT_SKILL_FILES_BASE64 = ${JSON.stringify(encodedFiles.map(({ path, sha256, size_bytes, content_base64 }) => ({ path, sha256, size_bytes, content_base64 })), null, 2)} as const;

export const PROJECT_SKILL_RELEASE_FILE_HASHES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(${JSON.stringify({ ...legacyReleases, [version]: fileHashes }, null, 2)});

export function getProjectSkillFiles(): ProjectSkillFile[] {
  return PROJECT_SKILL_FILES_BASE64.map((file) => ({
    path: file.path,
    sha256: file.sha256,
    size_bytes: file.size_bytes,
    content: Buffer.from(file.content_base64, "base64").toString("utf8"),
  }));
}
`;
writeFileSync("src/project/client-skill-bundle.generated.ts", generated, "utf8");
console.log(`Synced ${skillName} ${version} (${bundleSha256.slice(0, 12)})`);
