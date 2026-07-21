import { describe, test, expect } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRuntime } from "../src/project/runtime.js";
import { resetDocReadingConfig } from "../src/doc-reading-config.js";

async function freshRuntime(): Promise<ProjectRuntime> {
  const dir = await mkdtemp(join(tmpdir(), "cyj-test-"));
  const rt = new ProjectRuntime(dir);
  await rt.initialize();
  return rt;
}

async function withRuntime(fn: (rt: ProjectRuntime, dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cyj-test-"));
  const rt = new ProjectRuntime(dir);
  await rt.initialize();
  try {
    await fn(rt, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedProject(rt: ProjectRuntime, id = "proj-1", title = "Test Project"): Promise<void> {
  await rt.upsertRecord({
    id, type: "project", title, status: "active",
    project_id: id, created_by: "test-user",
    mission: "Run tests",
  });
}

async function startWorkFor(rt: ProjectRuntime, projectId = "proj-1", actor = "test-user"): Promise<string> {
  const started = await rt.startWork({
    project_id: projectId, objective: "Verify runtime",
    expected_outputs: ["tests passing"],
    acceptance_criteria: ["all green"],
    actor,
  });
  return started.work_id;
}

const ACTOR = "test-user";
const RESULT_HASH = "abc123def456";

describe("ProjectRuntime", () => {
  describe("happy path + idempotency", () => {
    test("fact with evidence is accepted and finishWork is idempotent", async () => {
      await withRuntime(async (rt) => {
        await seedProject(rt);
        const workId = await startWorkFor(rt);

        const result = await rt.finishWork({
          work_id: workId, outcome: "completed", summary: "All tests passed",
          result_hash: RESULT_HASH, actor: ACTOR,
          claims: [
            { kind: "fact", statement: "The system emits correct output for valid input", scope: "behavior", evidence_refs: ["test:output-valid"] },
          ],
        });

        expect(result.work_status).toBe("completed");
        expect(result.promoted_memory_ids).toHaveLength(1);
        expect(result.quarantined_memory_ids).toHaveLength(0);
        expect(result.rejected_memory_ids).toHaveLength(0);
        expect(result.validation_event_ids).toHaveLength(1);
        expect(result.audit_event_id).toBeTruthy();
        expect(result.policy_trace_id).toMatch(/^trace:cyj:/);

        const promotedId = result.promoted_memory_ids[0]!;

        const second = await rt.finishWork({
          work_id: workId, outcome: "completed", summary: "All tests passed",
          result_hash: RESULT_HASH, actor: ACTOR,
          claims: [
            { kind: "fact", statement: "The system emits correct output for valid input", scope: "behavior", evidence_refs: ["test:output-valid"] },
          ],
        });

        expect(second.promoted_memory_ids).toEqual(result.promoted_memory_ids);
        expect(second.quarantined_memory_ids).toEqual(result.quarantined_memory_ids);
        expect(second.rejected_memory_ids).toEqual(result.rejected_memory_ids);
        expect(second.validation_event_ids).toEqual(result.validation_event_ids);
        expect(second.audit_event_id).toBe(result.audit_event_id);

        const mem = await rt.get(promotedId);
        expect(mem).not.toBeNull();
        expect(mem!.record.status).toBe("accepted");
      });
    });
  });

  describe("quarantine and rejection", () => {
    test("lesson with single evidence is quarantined; secret-like value is rejected", async () => {
      await withRuntime(async (rt) => {
        await seedProject(rt);
        const workId = await startWorkFor(rt);

        const result = await rt.finishWork({
          work_id: workId, outcome: "completed", summary: "Mixed results",
          result_hash: RESULT_HASH, actor: ACTOR,
          claims: [
            { kind: "fact", statement: "Config parsing works", scope: "behavior", evidence_refs: ["test:config-test"] },
          ],
          lessons: [
            { kind: "lesson", statement: "We should add more logging", scope: "ops", evidence_refs: ["log:observation"] },
          ],
        });

        expect(result.promoted_memory_ids).toHaveLength(1);
        expect(result.quarantined_memory_ids).toHaveLength(1);
        expect(result.rejected_memory_ids).toHaveLength(0);

        const quarantinedId = result.quarantined_memory_ids[0]!;
        const mem = await rt.get(quarantinedId);
        expect(mem).not.toBeNull();
        expect(mem!.record.status).toBe("quarantined");
        expect(mem!.record.kind).toBe("lesson");

        const reconciled = await rt.reconcileMemory({ memory_id: quarantinedId, action: "add_evidence", rationale: "Added an independent trace", evidence_refs: ["log:independent-observation"], actor: ACTOR });
        expect(reconciled.status).toBe("accepted");
        expect((await rt.get(quarantinedId))!.record.status).toBe("accepted");

        const workId2 = await startWorkFor(rt);
        const result2 = await rt.finishWork({
          work_id: workId2, outcome: "completed", summary: "Rejection test",
          result_hash: "secret-test-001", actor: ACTOR,
          claims: [
            { kind: "fact", statement: "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", scope: "secret", evidence_refs: ["test:leak"] },
          ],
        });

        expect(result2.promoted_memory_ids).toHaveLength(0);
        expect(result2.rejected_memory_ids).toHaveLength(1);

        const rejectedId = result2.rejected_memory_ids[0]!;
        const mem2 = await rt.get(rejectedId);
        expect(mem2).not.toBeNull();
        expect(mem2!.record.status).toBe("rejected");

        const validationEventId = result2.validation_event_ids[0]!;
        const evt = await rt.get(validationEventId);
        expect(evt).not.toBeNull();
        expect(evt!.record.type).toBe("validation_event");
      });
    });
  });

  describe("conflict, brief, and lookup", () => {
    test("conflicting accepted fact triggers quarantine on new and dispute on old", async () => {
      await withRuntime(async (rt) => {
        await seedProject(rt);
        const workA = await startWorkFor(rt, "proj-1", ACTOR);

        const resultA = await rt.finishWork({
          work_id: workA, outcome: "completed", summary: "First claim",
          result_hash: "hash-a", actor: ACTOR,
          claims: [
            { kind: "fact", statement: "The answer is 42", scope: "meaning_of_life", evidence_refs: ["ref:book"] },
          ],
        });

        expect(resultA.promoted_memory_ids).toHaveLength(1);
        const oldId = resultA.promoted_memory_ids[0]!;

        const workB = await startWorkFor(rt, "proj-1", ACTOR);
        const resultB = await rt.finishWork({
          work_id: workB, outcome: "completed", summary: "Conflicting claim",
          result_hash: "hash-b", actor: ACTOR,
          claims: [
            { kind: "fact", statement: "The answer is 43", scope: "meaning_of_life", evidence_refs: ["ref:different-book"] },
          ],
        });

        expect(resultB.quarantined_memory_ids).toHaveLength(1);
        expect(resultB.promoted_memory_ids).toHaveLength(0);

        const oldMem = await rt.get(oldId);
        expect(oldMem).not.toBeNull();
        expect(oldMem!.record.status).toBe("disputed");
      });
    });

    test("brief returns project summary and lookup filters by type", async () => {
      await withRuntime(async (rt) => {
        await seedProject(rt);

        const brief = await rt.brief("proj-1");
        expect(brief.project_id).toBe("proj-1");
        expect(brief.project).toBeTruthy();
        expect((brief.project as Record<string, unknown>).title).toBe("Test Project");
        expect((brief.project as Record<string, unknown>).status).toBe("active");

        const workId = await startWorkFor(rt, "proj-1", ACTOR);
        const brief2 = await rt.brief("proj-1");
        expect((brief2.active_work as Array<unknown>)).toHaveLength(1);

        const workLookup = await rt.lookup("work_item", { project_id: "proj-1" });
        expect(workLookup).toHaveLength(1);
        expect(workLookup[0]!.id).toBe(workId);

        const projLookup = await rt.lookup("project", { id: "proj-1" });
        expect(projLookup).toHaveLength(1);
        expect(projLookup[0]!.title).toBe("Test Project");

        const emptyLookup = await rt.lookup("project", { id: "nonexistent" });
        expect(emptyLookup).toHaveLength(0);
      });
    });
  });

  describe("schema lint and rebuildable views", () => {
    test("reports invalid records and rebuilds a timeline without writing a view file", async () => {
      await withRuntime(async (rt) => {
        await rt.upsertRecord({
          id: "project:cyj:main", type: "project", title: "Main", status: "active", project_id: "project:cyj:main", created_by: ACTOR,
          mission: "Validate structured views", start_date: "2026-01-01", owners: [ACTOR], current_phase: "phase-2",
        });
        await rt.upsertRecord({
          id: "activity:cyj:visit-1", type: "activity", title: "Field visit", status: "completed", project_id: "project:cyj:main", created_by: ACTOR,
          kind: "field_visit", occurred_at: "2026-02-03T09:00:00.000Z",
        });
        await rt.upsertRecord({
          id: "claim:cyj:unsupported", type: "claim", title: "Unsupported", status: "supported", project_id: "project:cyj:main", created_by: ACTOR,
          kind: "fact", statement: "No evidence was attached",
        });

        const timeline = await rt.view("project:cyj:main", "timeline");
        expect(timeline.events).toEqual([expect.objectContaining({ id: "activity:cyj:visit-1", at: "2026-02-03T09:00:00.000Z" })]);
        expect((await rt.records()).filter(item => item.record.type === "view")).toHaveLength(0);

        const issues = await rt.lint("project:cyj:main");
        expect(issues).toContainEqual(expect.objectContaining({ code: "supported_claim_missing_evidence", record_id: "claim:cyj:unsupported" }));
      });
    });
  });

  describe("local-only source inventory", () => {
    test("inventories a configured relative root and registers idempotent artifacts", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await rt.configureSourceRoot({ id: "synthetic-source", project_id: "proj-1", relative_path: "incoming", actor: "agent:test" });
        await writeFile(join(dir, "incoming", "notes.md"), "# Synthetic notes\n", "utf8");

        const inventory = await rt.inventory("synthetic-source");
        expect(inventory.files).toHaveLength(1);
        expect(inventory.files[0]).toMatchObject({ relative_path: "notes.md", mime_type: "text/markdown" });

        const first = await rt.ingestInventory("synthetic-source", "agent:test");
        expect(first.registered_artifact_ids).toHaveLength(1);
        const firstArtifact = (await rt.get(first.registered_artifact_ids[0]!))!.record;
        expect(firstArtifact.original_relative_path).toBe("notes.md");
        expect(firstArtifact.status).toBe("parsed");
        expect((await rt.readResource(`kb://artifact/${encodeURIComponent(firstArtifact.id)}/document`)).text).toBe("# Synthetic notes\n");
        expect(await rt.search("Synthetic notes")).toEqual(expect.arrayContaining([expect.objectContaining({ record: expect.objectContaining({ id: firstArtifact.id }), snippet: expect.stringContaining("Synthetic notes") })]));

        const second = await rt.ingestInventory("synthetic-source", "agent:test");
        expect(second.registered_artifact_ids).toHaveLength(0);
        expect(second.unchanged_artifact_ids).toEqual(first.registered_artifact_ids);

        await rt.upsertRecord({
          id: "evidence:cyj:notes", type: "evidence", title: "Synthetic note evidence", status: "verified", project_id: "proj-1", created_by: ACTOR,
          artifact_id: first.registered_artifact_ids[0], locator: "line:1", content_fingerprint: "synthetic-fingerprint",
        });
        await rt.upsertRecord({
          id: "claim:cyj:notes", type: "claim", title: "Synthetic supported claim", status: "supported", project_id: "proj-1", created_by: ACTOR,
          kind: "fact", statement: "Synthetic notes support the claim", evidence_refs: ["evidence:cyj:notes"], source_refs: ["evidence:cyj:notes"],
        });

        await writeFile(join(dir, "incoming", "notes.md"), "# Synthetic notes revised\n", "utf8");
        const revised = await rt.ingestInventory("synthetic-source", "agent:test");
        expect(revised.stale_artifact_ids).toEqual(first.registered_artifact_ids);
        expect(revised.registered_artifact_ids).toHaveLength(1);
        expect((await rt.get(first.registered_artifact_ids[0]!))!.record.status).toBe("stale");
        expect((await rt.get("evidence:cyj:notes"))!.record.status).toBe("stale");
        expect((await rt.get("claim:cyj:notes"))!.record.status).toBe("disputed");
      });
    });
  });

  describe("MinerU API parsing gate", () => {
    test("fails closed without configured credentials and does not modify the original artifact", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await mkdir(join(dir, "incoming"));
        await writeFile(join(dir, "incoming", "report.pdf"), "%PDF-synthetic", "utf8");
        await writeFile(join(dir, "ingestion", "source-roots.yaml"), [
          "source_roots:",
          "  - id: synthetic-source",
          "    project_id: proj-1",
          "    relative_path: incoming",
        ].join("\n"), "utf8");
        await rt.upsertRecord({
          id: "artifact:cyj:pdf-gate", type: "artifact", title: "report.pdf", status: "registered", project_id: "proj-1", created_by: ACTOR,
          mime_type: "application/pdf", size_bytes: 14, sha256: "synthetic", original_relative_path: "report.pdf", acquired_at: "2026-01-01T00:00:00.000Z", source_root_id: "synthetic-source",
        });

        const originalKey = process.env.MINERU_API_KEY;
        delete process.env.MINERU_API_KEY;
        resetDocReadingConfig();
        try {
          await expect(rt.parseArtifactWithMinerU("artifact:cyj:pdf-gate", "agent:test")).rejects.toThrow("MinerU API parsing requires");
          expect((await rt.get("artifact:cyj:pdf-gate"))!.record.status).toBe("registered");
        } finally {
          if (originalKey === undefined) delete process.env.MINERU_API_KEY;
          else process.env.MINERU_API_KEY = originalKey;
          resetDocReadingConfig();
        }
      });
    });
  });

  describe("Agent bootstrap", () => {
    test("creates a project once and a dedicated source root without accepting the data root itself", async () => {
      await withRuntime(async (rt) => {
        const first = await rt.bootstrapProject({ project_id: "project:cyj:bootstrap", title: "Bootstrap", mission: "Create durable project records", actor: "agent:test" });
        const second = await rt.bootstrapProject({ project_id: "project:cyj:bootstrap", title: "Bootstrap", mission: "Create durable project records", actor: "agent:test" });
        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        await expect(rt.configureSourceRoot({ id: "bad-root", project_id: first.project_id, relative_path: ".", actor: "agent:test" })).rejects.toThrow("dedicated subdirectory");
      });
    });
  });

  describe("derived artifact resources", () => {
    test("reads a normalized artifact page by stable kb URI without exposing a file path", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await mkdir(join(dir, "normalized", "artifact_cyj_demo"), { recursive: true });
        await writeFile(join(dir, "normalized", "artifact_cyj_demo", "document.md"), "# Demo\n\n## Page 1\n\nFirst page.\n\n## Page 2\n\nSecond page.\n", "utf8");
        await rt.upsertRecord({
          id: "artifact:cyj:demo", type: "artifact", title: "Demo PDF", status: "parsed", project_id: "proj-1", created_by: ACTOR,
          mime_type: "application/pdf", size_bytes: 1, sha256: "demo", original_relative_path: "demo.pdf", acquired_at: "2026-01-01T00:00:00.000Z", normalized_markdown_path: "normalized/artifact_cyj_demo/document.md",
        });
        const page = await rt.readResource("kb://artifact/artifact%3Acyj%3Ademo/page/2");
        expect(page.text).toContain("Second page.");
        expect(page.text).not.toContain("First page.");
      });
    });
  });

  describe("confidentiality boundary", () => {
    test("refuses a restricted resource under the default profile ceiling", async () => {
      await withRuntime(async (rt) => {
        await seedProject(rt);
        await rt.upsertRecord({ id: "risk:cyj:restricted", type: "risk", title: "Restricted", status: "open", project_id: "proj-1", created_by: ACTOR, confidentiality: "restricted", probability: "high", impact: "high", owner: ACTOR, mitigation: "restricted" });
        await expect(rt.readResource("risk:cyj:restricted")).rejects.toThrow("confidentiality scope");
        expect((await rt.readResource("risk:cyj:restricted", "secret")).title).toBe("Restricted");
      });
    });
  });

  describe("visual context RAG", () => {
    test("extracts image associations from source markdown during ingestion", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await rt.configureSourceRoot({ id: "visual-src", project_id: "proj-1", relative_path: "visual-in", actor: "agent:test" });
        await writeFile(join(dir, "visual-in", "report.md"), [
          "# System Architecture",
          "",
          "## Page 1",
          "",
          "The system consists of three layers.",
          "",
          "Architecture diagram",
          "![Architecture Overview](./assets/arch.png)",
          "",
          "## Page 2",
          "",
          "The data flow is shown below.",
          "",
          "![Data Flow](./assets/flow.png)",
          "",
        ].join("\n"), "utf8");

        const first = await rt.ingestInventory("visual-src", "agent:test");
        expect(first.registered_artifact_ids).toHaveLength(1);
        const artifact = (await rt.get(first.registered_artifact_ids[0]!))!.record;
        const images = artifact.image_associations as Array<Record<string, unknown>> | undefined;
        expect(images).toBeDefined();
        expect(images).toHaveLength(2);
        expect(images![0]).toMatchObject({ alt_text: "Architecture Overview", caption: "Architecture diagram", page: 1, section: "Page 1" });
        expect(images![1]).toMatchObject({ alt_text: "Data Flow", page: 2, section: "Page 2" });
        expect(typeof images![0]!.resource_uri).toBe("string");
        expect((images![0]!.resource_uri as string)).toContain("kb://artifact/");
      });
    });

    test("includes visual context in search results for artifacts with images", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await rt.configureSourceRoot({ id: "visual-search", project_id: "proj-1", relative_path: "visual-s", actor: "agent:test" });
        await writeFile(join(dir, "visual-s", "spec.md"), [
          "# Deployment Spec",
          "",
          "## Page 1",
          "",
          "The production cluster uses Kubernetes for orchestration.",
          "",
          "![K8s Cluster Topology](./assets/k8s.png)",
          "",
        ].join("\n"), "utf8");

        await rt.ingestInventory("visual-search", "agent:test");
        const results = await rt.search("Kubernetes orchestration");
        expect(results.length).toBeGreaterThan(0);
        const hit = results[0]!;
        expect(hit.visual_context).toBeDefined();
        expect(hit.visual_context).toHaveLength(1);
        expect(hit.visual_context![0]!.alt_text).toBe("K8s Cluster Topology");
        expect(hit.visual_context![0]!.page).toBe(1);
        expect(hit.visual_context![0]!.resource_uri).toMatch(/^kb:\/\/artifact\//);
      });
    });

    test("no-image documents are backward compatible in search", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await rt.configureSourceRoot({ id: "noimg", project_id: "proj-1", relative_path: "noimg-in", actor: "agent:test" });
        await writeFile(join(dir, "noimg-in", "plain.md"), "# Plain Document\n\nJust text, no images.\n", "utf8");

        await rt.ingestInventory("noimg", "agent:test");
        const results = await rt.search("Plain Document");
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]!.visual_context).toBeUndefined();
        expect(results[0]!.snippet).toContain("Just text");
      });
    });

    test("reads image metadata via kb:// resource URI without exposing file paths", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await rt.configureSourceRoot({ id: "img-res", project_id: "proj-1", relative_path: "img-r", actor: "agent:test" });
        await writeFile(join(dir, "img-r", "photo.md"), [
          "# Field Report",
          "",
          "## Slide 1",
          "",
          "Site photo from the survey.",
          "",
          "![Site Survey Photo](./photos/site.jpg)",
          "",
        ].join("\n"), "utf8");

        const ingestion = await rt.ingestInventory("img-res", "agent:test");
        const artifactId = ingestion.registered_artifact_ids[0]!;
        const imageResult = await rt.readResource(`kb://artifact/${encodeURIComponent(artifactId)}/image/0`);
        expect(imageResult.text).toContain("Site Survey Photo");
        expect(imageResult.text).toContain(`kb://artifact/${encodeURIComponent(artifactId)}/image/0`);
        expect(imageResult.text).not.toContain("/photos/site.jpg");
        expect(imageResult.title).toContain("image 0");
      });
    });

    test("gracefully no-ops with markdown containing no images", async () => {
      await withRuntime(async (rt, dir) => {
        await seedProject(rt);
        await rt.configureSourceRoot({ id: "empty-img", project_id: "proj-1", relative_path: "empty-in", actor: "agent:test" });
        await writeFile(join(dir, "empty-in", "links.md"), [
          "# Links Only",
          "",
          "Just a [markdown link](https://example.com) and some **bold text**.",
          "",
          "No actual image references here.",
          "",
        ].join("\n"), "utf8");

        const ingestion = await rt.ingestInventory("empty-img", "agent:test");
        const artifact = (await rt.get(ingestion.registered_artifact_ids[0]!))!.record;
        const images = artifact.image_associations as Array<unknown> | undefined;
        expect(images).toBeDefined();
        expect(images).toHaveLength(0);
      });
    });
  });
});
