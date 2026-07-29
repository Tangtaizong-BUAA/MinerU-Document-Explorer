import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CanonicalRevisionStore } from "../src/project/revision-store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("immutable canonical revision publisher", () => {
  test("publishes complete revisions through one validated pointer", async () => {
    const root = await mkdtemp(join(tmpdir(), "cyj-revision-")); roots.push(root);
    const store = new CanonicalRevisionStore(root);
    const first = await store.publish([{ directory: "registry", filename: "project.md", content: "first" }]);
    const second = await store.publish([
      { directory: "registry", filename: "project.md", content: "second" },
      { directory: "memory", filename: "memory.md", content: "memory" },
    ]);
    expect(second.knowledge_revision).not.toBe(first.knowledge_revision);
    expect(await store.pointer()).toEqual(second);
    expect(await readFile(join(await store.activeDirectory("registry"), "project.md"), "utf8")).toBe("second");
    expect(await readFile(join(root, "knowledge", "revisions", first.knowledge_revision, "canonical", "registry", "project.md"), "utf8")).toBe("first");
    expect(await readdir(join(root, "knowledge", "staging"))).toEqual([]);
  });

  test("rejects unsafe filenames without moving the current pointer", async () => {
    const root = await mkdtemp(join(tmpdir(), "cyj-revision-")); roots.push(root);
    const store = new CanonicalRevisionStore(root);
    const first = await store.publish([{ directory: "registry", filename: "safe.md", content: "safe" }]);
    await expect(store.publish([{ directory: "registry", filename: "../escape.md", content: "bad" }])).rejects.toThrow("Unsafe");
    expect(await store.pointer()).toEqual(first);
  });

  test("serializes publishers from independent store instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "cyj-revision-")); roots.push(root);
    const firstProcess = new CanonicalRevisionStore(root);
    const secondProcess = new CanonicalRevisionStore(root);

    await Promise.all([
      firstProcess.publish([{ directory: "registry", filename: "project.md", content: "project" }]),
      secondProcess.publish([{ directory: "memory", filename: "facts.md", content: "facts" }]),
    ]);

    const active = await firstProcess.pointer();
    expect(active).not.toBeNull();
    const canonical = join(root, "knowledge", "revisions", active!.knowledge_revision, "canonical");
    expect(await readFile(join(canonical, "registry", "project.md"), "utf8")).toBe("project");
    expect(await readFile(join(canonical, "memory", "facts.md"), "utf8")).toBe("facts");
  });
});
