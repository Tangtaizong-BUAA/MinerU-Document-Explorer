import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  PROJECT_SKILL_BUNDLE_SHA256,
  PROJECT_SKILL_VERSION,
  syncProjectSkill,
} from "../src/project/client-skill.js";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("Changyi Jiuan incremental client Skill synchronization", () => {
  test("returns a file-level legacy upgrade with verifiable safe paths", () => {
    const result = syncProjectSkill({ client: "codex", installed_version: "0.3.0" });
    expect(result.status).toBe("update_required");
    expect(result.target_version).toBe("0.5.0");
    expect(result.delta.bundle_sha256).toBe(PROJECT_SKILL_BUNDLE_SHA256);
    expect(result.delta.files.map(file => file.path)).toEqual([
      "SKILL.md",
      "agents/openai.yaml",
      "references/mcp-workflow.md",
      "skill-version.json",
    ]);
    for (const file of result.delta.files) {
      expect(file.path.startsWith("/")).toBe(false);
      expect(file.path.split("/")).not.toContain("..");
      expect(sha256(file.content)).toBe(file.sha256);
      expect(Buffer.byteLength(file.content)).toBe(file.size_bytes);
    }
  });

  test("returns only a damaged file and the new manifest", () => {
    const bootstrap = syncProjectSkill({ client: "codex", installed_version: "unknown" });
    const installedFiles = bootstrap.delta.files
      .filter(file => file.path !== "skill-version.json")
      .map(file => ({ path: file.path, sha256: file.path === "SKILL.md" ? "0".repeat(64) : file.sha256 }));
    const result = syncProjectSkill({ client: "codex", installed_version: PROJECT_SKILL_VERSION, installed_files: installedFiles });
    expect(result.status).toBe("update_required");
    expect(result.delta.files.map(file => file.path)).toEqual(["SKILL.md", "skill-version.json"]);
    expect(result.delta.unchanged_paths).toEqual(["agents/openai.yaml", "references/mcp-workflow.md"]);
  });

  test("returns no content when version and managed hashes match", () => {
    const bootstrap = syncProjectSkill({ client: "hermes", installed_version: "unknown" });
    const installedFiles = bootstrap.delta.files
      .filter(file => file.path !== "skill-version.json")
      .map(file => ({ path: file.path, sha256: file.sha256 }));
    const result = syncProjectSkill({ client: "hermes", installed_version: PROJECT_SKILL_VERSION, installed_files: installedFiles });
    expect(result.status).toBe("current");
    expect(result.delta.files).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("# 长翼久安知识库操作");
    expect(result.install.requires_new_session).toBe(true);
  });

  test("does not delete client files that were never managed by a known release", () => {
    const result = syncProjectSkill({
      client: "qoder",
      installed_version: PROJECT_SKILL_VERSION,
      installed_files: [{ path: "user-notes.md", sha256: "0".repeat(64) }],
    });
    expect(result.delta.remove_paths).toEqual([]);
  });

  test("rejects traversal and absolute paths reported by a client", () => {
    expect(() => syncProjectSkill({
      client: "generic",
      installed_version: "0.5.0",
      installed_files: [{ path: "../other-skill/SKILL.md", sha256: "0".repeat(64) }],
    })).toThrow("unsafe relative path");
    expect(() => syncProjectSkill({
      client: "generic",
      installed_version: "0.5.0",
      installed_files: [{ path: "C:\\skills\\SKILL.md", sha256: "0".repeat(64) }],
    })).toThrow("unsafe relative path");
  });
});
