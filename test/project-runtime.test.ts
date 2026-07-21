import { describe, test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRuntime } from "../src/project/runtime.js";

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
});
