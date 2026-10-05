// Standalone compatibility adapter; deployed Skill bytes are supplied by config.ts.
export const PROJECT_MCP_SERVER_VERSION = "0.8.2";
export const PROJECT_SKILL_NAME = "knowledge-engine";
export const PROJECT_SKILL_VERSION = "0.8.2";
export const PROJECT_SKILL_BUNDLE_SHA256 = "a3d29d6508e31fab55ee122e6a72bfef949c77893bb327e3b998d97dee6a7bad";
export type ProjectSkillFile = { path: string; content: string; sha256: string; size_bytes: number };
export const PROJECT_SKILL_RELEASE_FILE_HASHES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};
export function getProjectSkillFiles(): ProjectSkillFile[] { throw new Error("Use the deployment CLI to supply this instance's Skill release"); }
