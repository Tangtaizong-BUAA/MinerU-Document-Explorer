/**
 * Changyi Jiuan project runtime.
 *
 * Phase 1 deliberately keeps project truth in Markdown + frontmatter and
 * derives no additional mandatory database. It is safe to run against an
 * empty synthetic fixture directory and never touches QMD's SQLite schema.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { validateProjectRecords, type ValidationIssue } from "./validation.js";
import { buildProjectView, PROJECT_VIEW_KINDS, type ProjectViewKind } from "./views.js";

export type ProjectProfile = "upstream-full" | "project-read" | "project-maintain" | "project-admin";
export type MemoryKind = "fact" | "decision" | "procedure" | "lesson" | "constraint" | "preference" | "open_question";
export type MemoryStatus = "candidate" | "validating" | "accepted" | "quarantined" | "rejected" | "disputed" | "superseded";

export type KnowledgeRecord = {
  id: string;
  type: string;
  title: string;
  status: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  source_refs?: string[];
  confidentiality?: "public" | "internal" | "restricted" | "secret";
  schema_version?: number;
  [key: string]: unknown;
};

type RecordInput = {
  id: string;
  type: string;
  title: string;
  status: string;
  project_id: string;
  created_by: string;
  source_refs?: string[];
  confidentiality?: "public" | "internal" | "restricted" | "secret";
  schema_version?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type MemorySubmission = {
  kind: MemoryKind;
  statement: string;
  scope: string;
  evidence_refs?: string[];
  confidence?: number;
};

export type FinishWorkInput = {
  work_id: string;
  outcome: "completed" | "partial" | "failed" | "cancelled";
  summary: string;
  result_hash: string;
  actor: string;
  artifacts?: string[];
  claims?: Omit<MemorySubmission, "kind">[];
  decisions?: Omit<MemorySubmission, "kind">[];
  lessons?: Omit<MemorySubmission, "kind">[];
  unresolved?: string[];
  evidence_refs?: string[];
};

export type ValidationDecision = "accepted" | "quarantined" | "rejected" | "disputed" | "superseded";
export type ValidationEvent = KnowledgeRecord & {
  type: "validation_event";
  decision: ValidationDecision;
  reason_codes: string[];
  subject_ref: string;
  policy_id: string;
  policy_version: string;
  input_hash: string;
  trace_id: string;
};

export type FinishWorkResult = {
  work_status: string;
  accepted_updates: string[];
  promoted_memory_ids: string[];
  quarantined_memory_ids: string[];
  rejected_memory_ids: string[];
  remediation_work_ids: string[];
  validation_event_ids: string[];
  policy_trace_id: string;
  audit_event_id: string;
};

const POLICY_ID = "memory-policy";
const POLICY_VERSION = "0.2.0";
const SECRET_PATTERN = /(?:gh[ops]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/;

function now(): string { return new Date().toISOString(); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function safeName(id: string): string { return id.replace(/[^A-Za-z0-9._-]/g, "_"); }
function newId(type: string): string { return `${type}:cyj:${randomUUID().replace(/-/g, "")}`; }

function renderRecord(record: KnowledgeRecord, body = ""): string {
  const frontmatter = YAML.stringify(record).trimEnd();
  return `---\n${frontmatter}\n---\n\n${body || `# ${record.title}\n`}`;
}

function parseRecord(text: string): { record: KnowledgeRecord; body: string } {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) throw new Error("Project record is missing YAML frontmatter");
  const parsed = YAML.parse(match[1] ?? "") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Project record frontmatter must be an object");
  const record = parsed as KnowledgeRecord;
  for (const key of ["id", "type", "title", "status", "project_id", "created_at", "updated_at", "created_by"]) {
    if (typeof record[key] !== "string" || record[key] === "") throw new Error(`Project record missing ${key}`);
  }
  return { record, body: match[2] ?? "" };
}

export class ProjectRuntime {
  readonly root: string;

  constructor(root: string) { this.root = root; }

  async initialize(): Promise<void> {
    await Promise.all(["registry", "memory", "events", "audit"].map(dir => mkdir(join(this.root, dir), { recursive: true })));
  }

  private directoryFor(record: KnowledgeRecord): string {
    if (record.type === "memory") return "memory";
    if (record.type === "validation_event") return "events";
    return "registry";
  }

  private async writeRecord(record: KnowledgeRecord, body = ""): Promise<void> {
    await this.initialize();
    const path = join(this.root, this.directoryFor(record), `${safeName(record.id)}.md`);
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, renderRecord(record, body), "utf8");
    await rename(temp, path);
  }

  private async readDirectory(dir: string): Promise<Array<{ record: KnowledgeRecord; body: string }>> {
    await this.initialize();
    const folder = join(this.root, dir);
    const names = await readdir(folder);
    const records = await Promise.all(names.filter(name => name.endsWith(".md")).map(async name => {
      const text = await readFile(join(folder, name), "utf8");
      return parseRecord(text);
    }));
    return records;
  }

  async records(): Promise<Array<{ record: KnowledgeRecord; body: string }>> {
    const [registry, memory, events] = await Promise.all([this.readDirectory("registry"), this.readDirectory("memory"), this.readDirectory("events")]);
    return [...registry, ...memory, ...events];
  }

  async get(id: string): Promise<{ record: KnowledgeRecord; body: string } | null> {
    const found = (await this.records()).find(item => item.record.id === id);
    return found ?? null;
  }

  async upsertRecord(input: RecordInput, body = ""): Promise<KnowledgeRecord> {
    const existing = await this.get(input.id);
    const record: KnowledgeRecord = {
      ...input,
      created_at: existing?.record.created_at ?? input.created_at ?? now(),
      updated_at: now(),
      source_refs: input.source_refs ?? [],
      confidentiality: input.confidentiality ?? "internal",
      schema_version: input.schema_version ?? 1,
    };
    await this.writeRecord(record, body);
    return record;
  }

  async startWork(input: { project_id: string; objective: string; expected_outputs: string[]; acceptance_criteria: string[]; actor: string; input_refs?: string[] }): Promise<{ work_id: string; knowledge_version: string; brief_uri: string; closeout_requirements: string[] }> {
    const workId = newId("work_item");
    const record = await this.upsertRecord({
      id: workId,
      type: "work_item",
      title: input.objective,
      status: "in_progress",
      project_id: input.project_id,
      created_by: input.actor,
      objective: input.objective,
      expected_outputs: input.expected_outputs,
      acceptance_criteria: input.acceptance_criteria,
      input_refs: input.input_refs ?? [],
    });
    return {
      work_id: record.id,
      knowledge_version: digest(JSON.stringify((await this.records()).map(item => [item.record.id, item.record.updated_at]))).slice(0, 16),
      brief_uri: `kb://project/${encodeURIComponent(input.project_id)}/brief`,
      closeout_requirements: ["summary", "result_hash", "outcome", "evidence_refs for factual memory"],
    };
  }

  private memoryFromSubmission(work: KnowledgeRecord, submission: MemorySubmission, actor: string, resultHash: string, ordinal: number): KnowledgeRecord {
    const id = `memory:cyj:${digest(`${work.id}:${resultHash}:${ordinal}:${submission.kind}:${submission.statement}`).slice(0, 24)}`;
    const timestamp = now();
    return {
      id,
      type: "memory",
      title: submission.statement.slice(0, 120),
      status: "candidate",
      project_id: work.project_id,
      created_at: timestamp,
      updated_at: timestamp,
      created_by: actor,
      source_refs: submission.evidence_refs ?? [],
      confidentiality: "internal",
      schema_version: 1,
      kind: submission.kind,
      statement: submission.statement,
      scope: submission.scope,
      source_work_id: work.id,
      evidence_refs: submission.evidence_refs ?? [],
      confidence: submission.confidence ?? 0.5,
      policy_version: POLICY_VERSION,
    };
  }

  private async evaluateMemory(candidate: KnowledgeRecord, actor: string): Promise<{ decision: ValidationDecision; reasons: string[]; remediation?: string }> {
    const statement = String(candidate.statement ?? "");
    const kind = String(candidate.kind ?? "");
    const refs = Array.isArray(candidate.evidence_refs) ? candidate.evidence_refs.filter((ref): ref is string => typeof ref === "string") : [];
    if (SECRET_PATTERN.test(statement)) return { decision: "rejected", reasons: ["secret_pattern_detected"] };
    if (statement.trim().length < 8) return { decision: "rejected", reasons: ["statement_too_short"] };
    if (kind !== "open_question" && refs.length === 0) return { decision: "quarantined", reasons: ["missing_evidence"], remediation: "add_evidence" };
    if (kind === "lesson" && refs.length < 2) return { decision: "quarantined", reasons: ["lesson_requires_independent_evidence"], remediation: "add_independent_evidence" };
    if (["decision", "constraint", "preference"].includes(kind) && !refs.some(ref => ref.startsWith("user:") || ref.startsWith("adr:"))) {
      return { decision: "quarantined", reasons: ["missing_authoritative_directive"], remediation: "add_authoritative_source" };
    }
    const existing = (await this.records()).map(item => item.record).filter(record =>
      record.type === "memory" && record.status === "accepted" && record.id !== candidate.id &&
      record.kind === candidate.kind && record.scope === candidate.scope && record.statement !== candidate.statement,
    );
    if (existing.length > 0) {
      for (const record of existing) await this.upsertRecord({ ...record, status: "disputed", created_by: actor });
      return { decision: "quarantined", reasons: ["conflicts_with_accepted_memory"], remediation: "reconcile_conflict" };
    }
    return { decision: "accepted", reasons: ["policy_gates_passed"] };
  }

  private async appendAudit(event: Record<string, unknown>): Promise<string> {
    await this.initialize();
    const id = `audit:cyj:${randomUUID().replace(/-/g, "")}`;
    const path = join(this.root, "audit", "events.jsonl");
    const line = JSON.stringify({ id, at: now(), ...event }) + "\n";
    // Appending is intentional: audit history is append-only.
    await writeFile(path, line, { encoding: "utf8", flag: "a" });
    return id;
  }

  private async validateAndStore(candidate: KnowledgeRecord, actor: string): Promise<{ status: ValidationDecision; eventId: string; remediation?: string }> {
    const verdict = await this.evaluateMemory(candidate, actor);
    const traceId = `trace:cyj:${randomUUID().replace(/-/g, "")}`;
    const eventId = newId("validation_event");
    const event: ValidationEvent = {
      id: eventId,
      type: "validation_event",
      title: `Validation ${candidate.id}`,
      status: "completed",
      project_id: candidate.project_id,
      created_at: now(),
      updated_at: now(),
      created_by: actor,
      source_refs: candidate.source_refs ?? [],
      confidentiality: "internal",
      schema_version: 1,
      decision: verdict.decision,
      reason_codes: verdict.reasons,
      subject_ref: candidate.id,
      policy_id: POLICY_ID,
      policy_version: POLICY_VERSION,
      input_hash: digest(JSON.stringify(candidate)),
      trace_id: traceId,
    };
    await this.writeRecord(event, `# Validation event\n\n${verdict.reasons.join(", ")}`);
    await this.upsertRecord({ ...candidate, status: verdict.decision, validation_event_ref: eventId, validation_status: verdict.decision === "accepted" ? "verified" : verdict.decision === "rejected" ? "rejected" : "quarantined", created_by: candidate.created_by });
    return { status: verdict.decision, eventId, remediation: verdict.remediation };
  }

  async finishWork(input: FinishWorkInput): Promise<FinishWorkResult> {
    const current = await this.get(input.work_id);
    if (!current || current.record.type !== "work_item") throw new Error(`Unknown work item: ${input.work_id}`);
    const work = current.record;
    if (work.result_hash && work.result_hash !== input.result_hash) throw new Error("Work item already has a different result_hash; create a follow-up work item instead");
    if (work.result_hash === input.result_hash && work.closeout_result && typeof work.closeout_result === "object") return work.closeout_result as FinishWorkResult;

    const submissions: MemorySubmission[] = [
      ...(input.claims ?? []).map(item => ({ ...item, kind: "fact" as const })),
      ...(input.decisions ?? []).map(item => ({ ...item, kind: "decision" as const })),
      ...(input.lessons ?? []).map(item => ({ ...item, kind: "lesson" as const })),
    ];
    const result: FinishWorkResult = {
      work_status: input.outcome === "completed" ? "completed" : input.outcome,
      accepted_updates: [], promoted_memory_ids: [], quarantined_memory_ids: [], rejected_memory_ids: [], remediation_work_ids: [], validation_event_ids: [],
      policy_trace_id: `trace:cyj:${randomUUID().replace(/-/g, "")}`,
      audit_event_id: "",
    };
    for (const [ordinal, submission] of submissions.entries()) {
      const candidate = this.memoryFromSubmission(work, submission, input.actor, input.result_hash, ordinal);
      const existing = await this.get(candidate.id);
      if (existing?.record.validation_event_ref) {
        const status = existing.record.status as ValidationDecision;
        if (status === "accepted") result.promoted_memory_ids.push(candidate.id);
        else if (status === "rejected") result.rejected_memory_ids.push(candidate.id);
        else result.quarantined_memory_ids.push(candidate.id);
        continue;
      }
      await this.writeRecord(candidate, `# ${candidate.title}\n\n${submission.statement}`);
      const verdict = await this.validateAndStore(candidate, input.actor);
      result.validation_event_ids.push(verdict.eventId);
      if (verdict.status === "accepted") result.promoted_memory_ids.push(candidate.id);
      else if (verdict.status === "rejected") result.rejected_memory_ids.push(candidate.id);
      else result.quarantined_memory_ids.push(candidate.id);
      if (verdict.remediation) result.remediation_work_ids.push(`remediation:${candidate.id}:${verdict.remediation}`);
    }
    result.accepted_updates = result.promoted_memory_ids;
    result.audit_event_id = await this.appendAudit({ type: "work_closeout", work_id: work.id, result_hash: input.result_hash, actor: input.actor, result });
    await this.upsertRecord({
      ...work,
      status: result.work_status,
      created_by: work.created_by,
      result_hash: input.result_hash,
      closeout_result: result,
      closeout_summary: input.summary,
      outcome: input.outcome,
      artifacts: input.artifacts ?? [],
      unresolved: input.unresolved ?? [],
      evidence_refs: input.evidence_refs ?? [],
    }, current.body);
    return result;
  }

  async lookup(entityType: string, filters: Record<string, string | number | boolean | undefined> = {}, limit = 20): Promise<KnowledgeRecord[]> {
    const normalized = Object.entries(filters).filter(([, value]) => value !== undefined);
    return (await this.records()).map(item => item.record).filter(record => {
      if (record.type !== entityType) return false;
      return normalized.every(([key, value]) => String(record[key]) === String(value));
    }).slice(0, Math.min(limit, 100));
  }

  async search(query: string, limit = 5, includeUnverified = false): Promise<Array<{ record: KnowledgeRecord; score: number; snippet: string }>> {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return (await this.records()).map(item => ({ ...item, haystack: `${item.record.title}\n${item.body}\n${JSON.stringify(item.record)}`.toLocaleLowerCase() }))
      .filter(item => item.record.type !== "validation_event")
      .filter(item => includeUnverified || item.record.status === "accepted" || item.record.type !== "memory")
      .map(item => ({ ...item, score: terms.reduce((total, term) => total + (item.haystack.includes(term) ? 1 : 0), 0) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
      .slice(0, Math.min(limit, 20))
      .map(item => ({ record: item.record, score: item.score, snippet: item.body.slice(0, 400) }));
  }

  async brief(projectId: string): Promise<Record<string, unknown>> {
    const records = (await this.records()).map(item => item.record);
    const project = records.find(record => record.type === "project" && record.id === projectId) ?? null;
    const activeWork = records.filter(record => record.type === "work_item" && record.project_id === projectId && ["in_progress", "awaiting_closeout", "blocked"].includes(record.status));
    const memories = records.filter(record => record.type === "memory" && record.project_id === projectId && record.status === "accepted").slice(0, 5);
    return { project_id: projectId, project: project ? { id: project.id, title: project.title, status: project.status, mission: project.mission } : null, active_work: activeWork.map(record => ({ id: record.id, title: record.title, status: record.status })), accepted_memory: memories.map(record => ({ id: record.id, kind: record.kind, statement: record.statement, scope: record.scope })), generated_at: now() };
  }

  async view(projectId: string, kind: ProjectViewKind): Promise<Record<string, unknown>> {
    if (!PROJECT_VIEW_KINDS.includes(kind)) throw new Error(`Unsupported project view: ${kind}`);
    return buildProjectView((await this.records()).map(item => item.record), projectId, kind);
  }

  async lint(projectId?: string): Promise<ValidationIssue[]> {
    const records = (await this.records()).map(item => item.record);
    const scoped = projectId ? records.filter(record => record.project_id === projectId || record.id === projectId) : records;
    return validateProjectRecords(scoped);
  }

  async readResource(uriOrId: string): Promise<{ uri: string; title: string; text: string }> {
    if (uriOrId.startsWith("kb://project/")) {
      const id = decodeURIComponent(uriOrId.split("/")[3] ?? "");
      const brief = await this.brief(id);
      return { uri: uriOrId, title: `Project brief ${id}`, text: YAML.stringify(brief) };
    }
    const parts = uriOrId.startsWith("kb://") ? uriOrId.split("/") : [];
    const id = parts.length >= 4 ? decodeURIComponent(parts.slice(3).join("/")) : uriOrId;
    const item = await this.get(id);
    if (!item) throw new Error(`Knowledge resource not found: ${uriOrId}`);
    return { uri: uriOrId.startsWith("kb://") ? uriOrId : `kb://record/${encodeURIComponent(item.record.id)}`, title: item.record.title, text: renderRecord(item.record, item.body) };
  }

  async health(): Promise<Record<string, unknown>> {
    const records = (await this.records()).map(item => item.record);
    return { status: "ok", root: this.root, records: records.length, quarantined: records.filter(record => record.status === "quarantined").length, disputed: records.filter(record => record.status === "disputed").length, policy_version: POLICY_VERSION };
  }
}

export function resolveProjectProfile(value: string | undefined): ProjectProfile {
  if (value === "project-read" || value === "project-maintain" || value === "project-admin" || value === "upstream-full") return value;
  return "upstream-full";
}

export function resolveProjectRoot(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}
