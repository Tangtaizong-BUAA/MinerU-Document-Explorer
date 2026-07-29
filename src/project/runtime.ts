/**
 * Changyi Jiuan project runtime.
 *
 * Phase 1 deliberately keeps project truth in Markdown + frontmatter and
 * derives no additional mandatory database. It is safe to run against an
 * empty synthetic fixture directory and never touches QMD's SQLite schema.
 */

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { validateProjectRecords, type ValidationIssue } from "./validation.js";
import { buildProjectView, PROJECT_VIEW_KINDS, type ProjectViewKind } from "./views.js";
import { inventorySourceRoot, parseSourceRoots, sourceFilePath, type InventoryEntry, type SourceRoot } from "./ingestion.js";

export type ProjectProfile = "upstream-full" | "project-read" | "project-maintain" | "project-admin";
export type MemoryKind = "fact" | "decision" | "procedure" | "lesson" | "constraint" | "preference" | "open_question";
export type MemoryStatus = "candidate" | "validating" | "accepted" | "quarantined" | "rejected" | "disputed" | "superseded";
export type Confidentiality = "public" | "internal" | "restricted" | "secret";

export type ImageAssociation = {
  alt_text?: string;
  caption?: string;
  page?: number;
  slide?: number;
  section?: string;
  resource_uri: string;
};

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
  confidentiality?: Confidentiality;
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
  confidentiality?: Confidentiality;
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

export type PublishResourceInput = {
  work_id: string;
  title: string;
  filename: string;
  content_type: string;
  encoding: "utf8" | "base64";
  content: string;
  kind: "note" | "report" | "deliverable" | "dataset" | "code" | "image" | "document";
  actor: string;
  source_refs?: string[];
  confidentiality?: Exclude<Confidentiality, "secret">;
};

export type PublishedResource = {
  artifact_id: string;
  work_id: string;
  status: string;
  sha256: string;
  size_bytes: number;
  resource_uri: string;
  searchable: boolean;
  mineru_parse_supported: boolean;
};

export type CaptureContextResult = {
  checkpoint_hash: string;
  promoted_memory_ids: string[];
  quarantined_memory_ids: string[];
  rejected_memory_ids: string[];
  validation_event_ids: string[];
  audit_event_id: string;
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
  knowledge_updates?: MemorySubmission[];
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
const MINERU_MIME_TYPES = new Set([
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/jp2",
]);
const INLINE_TEXT_MIME_TYPES = new Set(["text/markdown", "text/plain", "text/csv", "application/json", "application/yaml", "text/yaml"]);
const PUBLISHABLE_MIME_TYPES = new Set([...INLINE_TEXT_MIME_TYPES, ...MINERU_MIME_TYPES]);
const MAX_INLINE_RESOURCE_BYTES = 640 * 1024;

function now(): string { return new Date().toISOString(); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function digestBytes(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function safeName(id: string): string { return id.replace(/[^A-Za-z0-9._-]/g, "_"); }
function newId(type: string): string { return `${type}:cyj:${randomUUID().replace(/-/g, "")}`; }
function uniqueStrings(values: Array<string | undefined>): string[] { return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))]; }
function confidentialityAllowed(record: KnowledgeRecord, maximum: Confidentiality): boolean {
  const rank: Record<Confidentiality, number> = { public: 0, internal: 1, restricted: 2, secret: 3 };
  return rank[(record.confidentiality ?? "internal") as Confidentiality] <= rank[maximum];
}

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

function extractImageAssociations(markdown: string, artifactId: string): ImageAssociation[] {
  const associations: ImageAssociation[] = [];
  const lines = markdown.split("\n");
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/;

  let currentSection = "";
  let currentPage: number | undefined;
  let currentSlide: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const headingMatch = line.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      currentSection = headingMatch[1]!;
      const pageMatch = currentSection.match(/^Page\s+(\d+)$/i);
      if (pageMatch) { currentPage = parseInt(pageMatch[1]!, 10); }
      const slideMatch = currentSection.match(/^Slide\s+(\d+)$/i);
      if (slideMatch) { currentSlide = parseInt(slideMatch[1]!, 10); }
      continue;
    }

    const imgMatch = imageRegex.exec(line);
    if (!imgMatch) continue;

    const altText = imgMatch[1]?.trim() || undefined;
    let caption: string | undefined;

    if (i > 0) {
      const prev = lines[i - 1]!.trim();
      if (prev && !/^[#>\-*`|]/.test(prev) && !imageRegex.test(prev)) {
        caption = prev;
      }
    }

    associations.push({
      alt_text: altText,
      caption,
      page: currentPage,
      slide: currentSlide,
      section: currentSection || undefined,
      resource_uri: `kb://artifact/${encodeURIComponent(artifactId)}/image/${associations.length}`,
    });
  }

  return associations;
}

export class ProjectRuntime {
  readonly root: string;

  constructor(root: string) { this.root = root; }

  async initialize(): Promise<void> {
    await Promise.all(["registry", "memory", "events", "audit", "ingestion"].map(dir => mkdir(join(this.root, dir), { recursive: true })));
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
    const project = await this.get(input.project_id);
    if (!project || project.record.type !== "project") throw new Error(`Unknown project: ${input.project_id}`);
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
      closeout_requirements: ["publish durable resources", "capture distilled project context", "summary", "result_hash", "outcome", "evidence_refs for factual memory"],
    };
  }

  private managedResourcePath(relativePath: string): string {
    if (isAbsolute(relativePath) || !relativePath.startsWith("agent-resources/")) throw new Error("Managed resources must stay inside agent-resources");
    const rootPath = resolve(this.root);
    const target = resolve(rootPath, relativePath);
    const fromRoot = relative(rootPath, target);
    if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error("Managed resource path escapes the knowledge root");
    return target;
  }

  private decodePublishedContent(input: PublishResourceInput): Buffer {
    if (!PUBLISHABLE_MIME_TYPES.has(input.content_type)) throw new Error(`Unsupported published resource content_type: ${input.content_type}`);
    if (input.encoding === "utf8" && !INLINE_TEXT_MIME_TYPES.has(input.content_type)) throw new Error(`${input.content_type} resources must use base64 encoding`);
    let bytes: Buffer;
    if (input.encoding === "utf8") {
      if (SECRET_PATTERN.test(input.content)) throw new Error("Published text appears to contain a credential or private key");
      if (input.content_type === "application/json") JSON.parse(input.content);
      bytes = Buffer.from(input.content, "utf8");
    } else {
      const compact = input.content.replace(/\s+/g, "");
      if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new Error("Invalid base64 resource content");
      bytes = Buffer.from(compact, "base64");
      if (bytes.toString("base64").replace(/=+$/, "") !== compact.replace(/=+$/, "")) throw new Error("Invalid base64 resource content");
    }
    if (INLINE_TEXT_MIME_TYPES.has(input.content_type) && SECRET_PATTERN.test(bytes.toString("utf8"))) throw new Error("Published text appears to contain a credential or private key");
    if (bytes.length === 0) throw new Error("Published resource content cannot be empty");
    if (bytes.length > MAX_INLINE_RESOURCE_BYTES) throw new Error(`Published resource exceeds the ${MAX_INLINE_RESOURCE_BYTES}-byte inline MCP limit; use a configured source root for large files`);
    return bytes;
  }

  private async writeManagedResource(relativePath: string, bytes: Buffer): Promise<void> {
    const target = this.managedResourcePath(relativePath);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, target);
  }

  async publishResource(input: PublishResourceInput): Promise<PublishedResource> {
    const workItem = await this.get(input.work_id);
    if (!workItem || workItem.record.type !== "work_item") throw new Error(`Unknown work item: ${input.work_id}`);
    const work = workItem.record;
    const bytes = this.decodePublishedContent(input);
    const sha256 = digestBytes(bytes);
    const rawName = input.filename.split(/[\\/]/).pop()?.trim() ?? "";
    const filename = rawName.replace(/[^A-Za-z0-9._\-\u4e00-\u9fff]/g, "-").replace(/-+/g, "-").slice(0, 160);
    if (!filename || filename === "." || filename === "..") throw new Error("filename must contain a safe file name");
    const artifactId = `artifact:cyj:${digest(`${work.id}:${filename}:${sha256}`).slice(0, 24)}`;
    const existing = await this.get(artifactId);
    if (existing?.record.type === "artifact" && existing.record.sha256 === sha256 && existing.record.source_work_id === work.id) {
      return {
        artifact_id: artifactId, work_id: work.id, status: existing.record.status, sha256, size_bytes: bytes.length,
        resource_uri: `kb://artifact/${encodeURIComponent(artifactId)}/document`, searchable: typeof existing.record.normalized_markdown_path === "string",
        mineru_parse_supported: MINERU_MIME_TYPES.has(input.content_type),
      };
    }
    if (!['in_progress', 'blocked'].includes(work.status)) throw new Error(`Work item ${work.id} is already closed; start a follow-up work item`);

    const managedRelativePath = `agent-resources/${safeName(work.project_id)}/${safeName(work.id)}/${sha256.slice(0, 16)}-${filename}`;
    await this.writeManagedResource(managedRelativePath, bytes);
    let status = "registered";
    let normalizedMarkdownPath: string | undefined;
    let parseReportPath: string | undefined;
    let imageAssociations: ImageAssociation[] = [];
    if (INLINE_TEXT_MIME_TYPES.has(input.content_type)) {
      const text = bytes.toString("utf8");
      const normalized = input.content_type === "text/markdown" ? text : `# ${input.title}\n\n${text}`;
      normalizedMarkdownPath = `normalized/${safeName(artifactId)}/document.md`;
      parseReportPath = `normalized/${safeName(artifactId)}/parse-report.json`;
      const normalizedContent = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
      await this.writeDerived(normalizedMarkdownPath, normalizedContent);
      await this.writeDerived(parseReportPath, JSON.stringify({ artifact_id: artifactId, input_sha256: sha256, parser: "agent_inline_text", parser_mode: "local", egress: "none", normalized_markdown_path: normalizedMarkdownPath, completed_at: now() }, null, 2) + "\n");
      imageAssociations = extractImageAssociations(normalizedContent, artifactId);
      status = "parsed";
    }
    await this.upsertRecord({
      id: artifactId, type: "artifact", title: input.title, status, project_id: work.project_id, created_by: input.actor,
      mime_type: input.content_type, size_bytes: bytes.length, sha256, original_relative_path: managedRelativePath, managed_relative_path: managedRelativePath,
      managed_upload: true, acquired_at: now(), source_kind: "agent_generated", source_work_id: work.id, resource_kind: input.kind,
      source_refs: uniqueStrings([work.id, ...(input.source_refs ?? [])]), confidentiality: input.confidentiality ?? "internal",
      parser_status: status === "parsed" ? "completed" : "not_requested", parser_name: status === "parsed" ? "agent_inline_text" : undefined,
      parser_mode: status === "parsed" ? "local" : undefined, normalized_markdown_path: normalizedMarkdownPath, parse_report_path: parseReportPath,
      parsed_page_count: 0, image_associations: imageAssociations,
    }, `# ${input.title}\n\nAgent-generated resource captured from work item ${work.id}. It is persistent project material, not independently verified evidence.\n`);
    await this.appendAudit({ type: "agent_resource_published", artifact_id: artifactId, work_id: work.id, project_id: work.project_id, actor: input.actor, sha256, size_bytes: bytes.length, mime_type: input.content_type });
    return {
      artifact_id: artifactId, work_id: work.id, status, sha256, size_bytes: bytes.length,
      resource_uri: `kb://artifact/${encodeURIComponent(artifactId)}/document`, searchable: status === "parsed",
      mineru_parse_supported: MINERU_MIME_TYPES.has(input.content_type),
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

  private async persistMemorySubmissions(work: KnowledgeRecord, submissions: MemorySubmission[], actor: string, seed: string): Promise<{
    promoted: string[]; quarantined: string[]; rejected: string[]; validationEvents: string[]; remediation: string[];
  }> {
    const output = { promoted: [] as string[], quarantined: [] as string[], rejected: [] as string[], validationEvents: [] as string[], remediation: [] as string[] };
    for (const [ordinal, submission] of submissions.entries()) {
      const candidate = this.memoryFromSubmission(work, submission, actor, seed, ordinal);
      const existing = await this.get(candidate.id);
      if (existing?.record.validation_event_ref) {
        const status = existing.record.status as ValidationDecision;
        if (status === "accepted") output.promoted.push(candidate.id);
        else if (status === "rejected") output.rejected.push(candidate.id);
        else output.quarantined.push(candidate.id);
        continue;
      }
      await this.writeRecord(candidate, `# ${candidate.title}\n\n${submission.statement}`);
      const verdict = await this.validateAndStore(candidate, actor);
      output.validationEvents.push(verdict.eventId);
      if (verdict.status === "accepted") output.promoted.push(candidate.id);
      else if (verdict.status === "rejected") output.rejected.push(candidate.id);
      else output.quarantined.push(candidate.id);
      if (verdict.remediation) output.remediation.push(`remediation:${candidate.id}:${verdict.remediation}`);
    }
    return output;
  }

  async captureContext(input: { work_id: string; summary: string; updates: MemorySubmission[]; actor: string }): Promise<CaptureContextResult> {
    const current = await this.get(input.work_id);
    if (!current || current.record.type !== "work_item") throw new Error(`Unknown work item: ${input.work_id}`);
    if (input.summary.trim().length < 3) throw new Error("Context checkpoint summary is too short");
    if (input.updates.length === 0) throw new Error("Context checkpoint requires at least one structured update");
    if (SECRET_PATTERN.test(input.summary)) throw new Error("Context checkpoint summary appears to contain a credential or private key");
    const checkpointHash = digest(JSON.stringify({ work_id: input.work_id, summary: input.summary, updates: input.updates }));
    const checkpointId = `activity:cyj:context-${checkpointHash.slice(0, 24)}`;
    const existingCheckpoint = await this.get(checkpointId);
    if (existingCheckpoint?.record.capture_result && typeof existingCheckpoint.record.capture_result === "object") return existingCheckpoint.record.capture_result as CaptureContextResult;
    if (!["in_progress", "blocked"].includes(current.record.status)) throw new Error(`Work item ${input.work_id} is already closed; start a follow-up work item`);
    const stored = await this.persistMemorySubmissions(current.record, input.updates, input.actor, `context:${checkpointHash}`);
    const auditEventId = await this.appendAudit({
      type: "agent_context_captured", work_id: current.record.id, project_id: current.record.project_id, actor: input.actor,
      checkpoint_hash: checkpointHash, promoted_memory_ids: stored.promoted, quarantined_memory_ids: stored.quarantined,
      rejected_memory_ids: stored.rejected, validation_event_ids: stored.validationEvents,
    });
    const result: CaptureContextResult = {
      checkpoint_hash: checkpointHash, promoted_memory_ids: stored.promoted, quarantined_memory_ids: stored.quarantined,
      rejected_memory_ids: stored.rejected, validation_event_ids: stored.validationEvents, audit_event_id: auditEventId,
    };
    await this.upsertRecord({
      id: checkpointId, type: "activity", title: input.summary.slice(0, 120), status: "completed", project_id: current.record.project_id,
      created_by: input.actor, kind: "context_checkpoint", occurred_at: now(), source_work_id: current.record.id,
      checkpoint_hash: checkpointHash, capture_result: result,
      source_refs: uniqueStrings([current.record.id, ...stored.promoted, ...stored.quarantined, ...stored.rejected]),
    }, `# Context checkpoint\n\n${input.summary}\n`);
    return result;
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
      ...(input.knowledge_updates ?? []),
    ];
    const result: FinishWorkResult = {
      work_status: input.outcome === "completed" ? "completed" : input.outcome === "cancelled" ? "cancelled" : "blocked",
      accepted_updates: [], promoted_memory_ids: [], quarantined_memory_ids: [], rejected_memory_ids: [], remediation_work_ids: [], validation_event_ids: [],
      policy_trace_id: `trace:cyj:${randomUUID().replace(/-/g, "")}`,
      audit_event_id: "",
    };
    const stored = await this.persistMemorySubmissions(work, submissions, input.actor, input.result_hash);
    result.promoted_memory_ids.push(...stored.promoted);
    result.quarantined_memory_ids.push(...stored.quarantined);
    result.rejected_memory_ids.push(...stored.rejected);
    result.validation_event_ids.push(...stored.validationEvents);
    result.remediation_work_ids.push(...stored.remediation);
    result.accepted_updates = result.promoted_memory_ids;
    const generatedArtifacts = (await this.lookup("artifact", { source_work_id: work.id }, 100)).map(record => record.id);
    const artifactRefs = uniqueStrings([...(input.artifacts ?? []), ...generatedArtifacts]);
    result.audit_event_id = await this.appendAudit({ type: "work_closeout", work_id: work.id, result_hash: input.result_hash, actor: input.actor, result });
    await this.upsertRecord({
      ...work,
      status: result.work_status,
      created_by: work.created_by,
      result_hash: input.result_hash,
      closeout_result: result,
      closeout_summary: input.summary,
      outcome: input.outcome,
      artifacts: artifactRefs,
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

  async search(query: string, limit = 5, includeUnverified = false): Promise<Array<{ record: KnowledgeRecord; score: number; snippet: string; visual_context?: ImageAssociation[] }>> {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const indexed = await Promise.all((await this.records()).map(async (item) => {
      let normalized = "";
      if (item.record.type === "artifact" && typeof item.record.normalized_markdown_path === "string") {
        try { normalized = await readFile(join(this.root, item.record.normalized_markdown_path), "utf8"); } catch { /* stale derived text is excluded */ }
      }
      return { ...item, normalized, haystack: `${item.record.title}\n${item.body}\n${normalized}\n${JSON.stringify(item.record)}`.toLocaleLowerCase() };
    }));
    return indexed
      .filter(item => item.record.type !== "validation_event")
      .filter(item => includeUnverified || item.record.status === "accepted" || item.record.type !== "memory")
      .map(item => ({ ...item, score: terms.reduce((total, term) => total + (item.haystack.includes(term) ? 1 : 0), 0) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
      .slice(0, Math.min(limit, 20))
      .map(item => {
        const imageAssociations = item.record.type === "artifact" ? (item.record.image_associations as ImageAssociation[] | undefined) : undefined;
        const visualContext = imageAssociations?.length ? imageAssociations.slice(0, 5) : undefined;
        return { record: item.record, score: item.score, snippet: (item.normalized || item.body).slice(0, 400), visual_context: visualContext?.length ? visualContext : undefined };
      });
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

  async bootstrapProject(input: { project_id: string; title: string; mission: string; actor: string }): Promise<{ project_id: string; created: boolean; brief_uri: string }> {
    if (!input.project_id.startsWith("project:")) throw new Error("project_id must use the stable project: prefix");
    const existing = await this.get(input.project_id);
    if (existing) {
      if (existing.record.type !== "project") throw new Error(`ID already belongs to ${existing.record.type}: ${input.project_id}`);
      return { project_id: existing.record.id, created: false, brief_uri: `kb://project/${encodeURIComponent(existing.record.id)}/brief` };
    }
    await this.upsertRecord({
      id: input.project_id, type: "project", title: input.title, status: "active", project_id: input.project_id, created_by: input.actor,
      mission: input.mission, owners: [input.actor], current_phase: "knowledge-system-bootstrap", derivation: "agent", validation_status: "verified",
    }, `# ${input.title}\n\n${input.mission}\n`);
    await this.appendAudit({ type: "project_bootstrap", project_id: input.project_id, actor: input.actor });
    return { project_id: input.project_id, created: true, brief_uri: `kb://project/${encodeURIComponent(input.project_id)}/brief` };
  }

  private async sourceRoots(): Promise<SourceRoot[]> {
    try {
      return parseSourceRoots(await readFile(join(this.root, "ingestion", "source-roots.yaml"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("No configured source roots. Add ingestion/source-roots.yaml under CYJ_KB_ROOT first.");
      throw error;
    }
  }

  async configureSourceRoot(input: { id: string; project_id: string; relative_path: string; actor: string }): Promise<SourceRoot> {
    if (input.relative_path === "." || input.relative_path === "") throw new Error("A source root must be a dedicated subdirectory, not CYJ_KB_ROOT itself");
    const project = await this.get(input.project_id);
    if (!project || project.record.type !== "project") throw new Error(`Unknown project for source root: ${input.project_id}`);
    const root: SourceRoot = { id: input.id, project_id: input.project_id, relative_path: input.relative_path, enabled: true };
    // sourceFilePath validates both relative-path and project-root containment.
    const directory = dirname(sourceFilePath(this.root, root, ".source-root-marker"));
    await mkdir(directory, { recursive: true });
    let roots: SourceRoot[] = [];
    try { roots = await this.sourceRoots(); } catch (error) { if ((error as Error).message.includes("No configured source roots")) roots = []; else throw error; }
    const next = [...roots.filter(candidate => candidate.id !== root.id), root].sort((a, b) => a.id.localeCompare(b.id));
    await this.writeDerived("ingestion/source-roots.yaml", YAML.stringify({ source_roots: next }));
    await this.appendAudit({ type: "source_root_configured", source_root_id: root.id, project_id: root.project_id, actor: input.actor });
    return root;
  }

  private async sourceRootForArtifact(record: KnowledgeRecord): Promise<SourceRoot> {
    const sourceRootId = record.source_root_id;
    if (typeof sourceRootId !== "string") throw new Error(`Artifact ${record.id} has no source_root_id`);
    const sourceRoot = (await this.sourceRoots()).find(root => root.id === sourceRootId && root.enabled);
    if (!sourceRoot) throw new Error(`Artifact ${record.id} references an unknown or disabled source root`);
    return sourceRoot;
  }

  private async writeDerived(relativePath: string, text: string): Promise<void> {
    const target = join(this.root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, text, "utf8");
    await rename(temp, target);
  }

  private async staleArtifactAndDependents(artifact: KnowledgeRecord, actor: string): Promise<void> {
    const records = (await this.records()).map(item => item.record);
    await this.upsertRecord({ ...artifact, status: "stale", created_by: actor, stale_reason: "source_content_changed", stale_at: now() });
    const evidence = records.filter(record => record.type === "evidence" && record.artifact_id === artifact.id && record.status !== "stale");
    for (const record of evidence) await this.upsertRecord({ ...record, status: "stale", created_by: actor, stale_reason: "artifact_stale", stale_at: now() });
    const staleRefs = new Set([artifact.id, ...evidence.map(record => record.id)]);
    for (const record of records.filter(record => (record.type === "memory" && record.status === "accepted") || (record.type === "claim" && record.status === "supported"))) {
      const refs = [...(Array.isArray(record.source_refs) ? record.source_refs : []), ...(Array.isArray(record.evidence_refs) ? record.evidence_refs : [])];
      if (refs.some(ref => typeof ref === "string" && staleRefs.has(ref))) {
        await this.upsertRecord({ ...record, status: "disputed", created_by: actor, stale_reason: "dependent_evidence_stale", stale_at: now() });
      }
    }
  }

  async inventory(sourceRootId: string): Promise<{ source_root_id: string; project_id: string; files: InventoryEntry[] }> {
    const sourceRoot = (await this.sourceRoots()).find(root => root.id === sourceRootId && root.enabled);
    if (!sourceRoot) throw new Error(`Unknown or disabled source root: ${sourceRootId}`);
    return { source_root_id: sourceRoot.id, project_id: sourceRoot.project_id, files: await inventorySourceRoot(this.root, sourceRoot) };
  }

  async ingestInventory(sourceRootId: string, actor: string): Promise<{ job_id: string; source_root_id: string; registered_artifact_ids: string[]; unchanged_artifact_ids: string[]; stale_artifact_ids: string[] }> {
    const inventory = await this.inventory(sourceRootId);
    const sourceRoot = (await this.sourceRoots()).find(root => root.id === sourceRootId && root.enabled);
    if (!sourceRoot) throw new Error(`Unknown or disabled source root: ${sourceRootId}`);
    const registered: string[] = [];
    const unchanged: string[] = [];
    const stale: string[] = [];
    const jobId = newId("ingestion_job");
    await this.upsertRecord({ id: jobId, type: "ingestion_job", title: `Ingest ${sourceRootId}`, status: "running", project_id: inventory.project_id, created_by: actor, operation: "ingest", request_hash: digest(`${sourceRootId}:${inventory.files.map(file => file.sha256).join(",")}`) });
    const current = (await this.records()).map(item => item.record);
    for (const file of inventory.files) {
      const id = `artifact:cyj:${file.sha256.slice(0, 24)}`;
      const existing = await this.get(id);
      if (existing?.record.sha256 === file.sha256 && existing.record.status !== "stale") { unchanged.push(id); continue; }
      for (const prior of current.filter(record => record.type === "artifact" && record.source_root_id === sourceRootId && record.original_relative_path === file.relative_path && record.sha256 !== file.sha256 && record.status !== "stale")) {
        await this.staleArtifactAndDependents(prior, actor);
        stale.push(prior.id);
      }
      let status = "registered";
      let parserStatus = "not_requested";
      let parserFields: Record<string, unknown> = {};
      let body = `# ${file.relative_path}\n\nInventory-only registration. No MinerU parsing has been requested.\n`;
      if (file.mime_type === "text/markdown") {
        const markdown = await readFile(sourceFilePath(this.root, sourceRoot, file.relative_path), "utf8");
        const folder = `normalized/${safeName(id)}`;
        const normalizedPath = `${folder}/document.md`;
        const reportPath = `${folder}/parse-report.json`;
        const normalizedContent = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
        await this.writeDerived(normalizedPath, normalizedContent);
        await this.writeDerived(reportPath, JSON.stringify({ artifact_id: id, input_sha256: file.sha256, parser: "source_markdown", parser_mode: "local", egress: "none", normalized_markdown_path: normalizedPath, completed_at: now() }, null, 2) + "\n");
        const imageAssociations = extractImageAssociations(normalizedContent, id);
        status = "parsed";
        parserStatus = "completed";
        parserFields = { parser_name: "source_markdown", parser_mode: "local", parser_completed_at: now(), normalized_markdown_path: normalizedPath, parse_report_path: reportPath, parsed_page_count: 0, image_associations: imageAssociations };
        body = `# ${file.relative_path}\n\nImported canonical Markdown. Original source is preserved in its configured source root.\n`;
      }
      await this.upsertRecord({
        id, type: "artifact", title: file.relative_path, status, project_id: inventory.project_id, created_by: actor,
        mime_type: file.mime_type, size_bytes: file.size_bytes, sha256: file.sha256, original_relative_path: file.relative_path,
        acquired_at: file.modified_at, source_root_id: sourceRootId, parser_status: parserStatus, source_refs: [], ...parserFields,
      }, body);
      registered.push(id);
    }
    await this.upsertRecord({ id: jobId, type: "ingestion_job", title: `Ingest ${sourceRootId}`, status: "completed", project_id: inventory.project_id, created_by: actor, operation: "ingest", request_hash: digest(`${sourceRootId}:${inventory.files.map(file => file.sha256).join(",")}`), registered_artifact_ids: registered, unchanged_artifact_ids: unchanged, stale_artifact_ids: stale });
    await this.appendAudit({ type: "inventory_ingest", job_id: jobId, source_root_id: sourceRootId, actor, registered_artifact_ids: registered, unchanged_artifact_ids: unchanged, stale_artifact_ids: stale });
    return { job_id: jobId, source_root_id: sourceRootId, registered_artifact_ids: registered, unchanged_artifact_ids: unchanged, stale_artifact_ids: stale };
  }

  async parseArtifactWithMinerU(artifactId: string, actor: string): Promise<{ artifact_id: string; status: "parsed" | "failed"; normalized_markdown_path?: string; page_count?: number; error_code?: string }> {
    const existing = await this.get(artifactId);
    if (!existing || existing.record.type !== "artifact") throw new Error(`Unknown artifact: ${artifactId}`);
    const artifact = existing.record;
    if (typeof artifact.mime_type !== "string" || !MINERU_MIME_TYPES.has(artifact.mime_type)) throw new Error("MinerU API parsing supports registered PDF, image, Office, and spreadsheet artifacts only");
    if (typeof artifact.original_relative_path !== "string") throw new Error(`Artifact ${artifactId} has no original_relative_path`);
    if (artifact.status === "parsed" && typeof artifact.normalized_markdown_path === "string") {
      try {
        await readFile(join(this.root, artifact.normalized_markdown_path), "utf8");
        return { artifact_id: artifact.id, status: "parsed", normalized_markdown_path: artifact.normalized_markdown_path, page_count: Number(artifact.parsed_page_count ?? 0) };
      } catch { /* derived content was deleted; rebuild below */ }
    }
    const sourcePath = artifact.managed_upload === true && typeof artifact.managed_relative_path === "string"
      ? this.managedResourcePath(artifact.managed_relative_path)
      : sourceFilePath(this.root, await this.sourceRootForArtifact(artifact), artifact.original_relative_path);
    const sourceStat = await lstat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`Artifact ${artifactId} source is not a regular file`);

    const { getMinerUCredentials } = await import("../doc-reading-config.js");
    const credentials = getMinerUCredentials();
    if (!credentials) throw new Error("MinerU API parsing requires MINERU_API_KEY or qmd doc-reading credentials");

    await this.upsertRecord({ ...artifact, status: "parsing", created_by: actor, parser_name: "mineru_cloud", parser_mode: "api", parser_started_at: now() }, existing.body);
    try {
      const { extractPdfMineruCloud } = await import("../backends/python-utils.js");
      const result = await extractPdfMineruCloud(sourcePath, credentials.api_key);
      const pages = result.pages ?? [];
      const markdown = result.markdown?.trim() || pages.map(page => `## Page ${page.page_idx + 1}\n\n${page.text}`).join("\n\n").trim();
      if (result.error || !markdown) throw new Error(result.error || "MinerU returned no Markdown or page text");

      const folder = `normalized/${safeName(artifact.id)}`;
      const normalizedPath = `${folder}/document.md`;
      const reportPath = `${folder}/parse-report.json`;
      const normalizedMarkdown = markdown + "\n";
      await this.writeDerived(normalizedPath, normalizedMarkdown);
      await this.writeDerived(reportPath, JSON.stringify({
        artifact_id: artifact.id, input_sha256: artifact.sha256, parser: "mineru_cloud", parser_mode: "api", egress: "mineru_api",
        page_count: pages.length, normalized_markdown_path: normalizedPath, completed_at: now(),
      }, null, 2) + "\n");
      const imageAssociations = extractImageAssociations(normalizedMarkdown, artifact.id);
      await this.upsertRecord({
        ...artifact, status: "parsed", created_by: actor, parser_name: "mineru_cloud", parser_mode: "api", parser_completed_at: now(),
        normalized_markdown_path: normalizedPath, parse_report_path: reportPath, parsed_page_count: pages.length,
        image_associations: imageAssociations,
      }, existing.body);
      await this.appendAudit({ type: "mineru_api_parse", artifact_id: artifact.id, actor, egress: "mineru_api", outcome: "parsed", page_count: pages.length });
      return { artifact_id: artifact.id, status: "parsed", normalized_markdown_path: normalizedPath, page_count: pages.length };
    } catch (error) {
      await this.upsertRecord({ ...artifact, status: "failed", created_by: actor, parser_name: "mineru_cloud", parser_mode: "api", parser_failed_at: now(), parser_error_code: "mineru_api_parse_failed" }, existing.body);
      await this.appendAudit({ type: "mineru_api_parse", artifact_id: artifact.id, actor, egress: "mineru_api", outcome: "failed", error_code: "mineru_api_parse_failed" });
      return { artifact_id: artifact.id, status: "failed", error_code: "mineru_api_parse_failed" };
    }
  }

  async retryFailedParses(actor: string, limit = 20): Promise<{ attempted: string[]; parsed: string[]; failed: string[] }> {
    const failedArtifacts = (await this.records()).map(item => item.record)
      .filter(record => record.type === "artifact" && record.status === "failed" && typeof record.mime_type === "string" && MINERU_MIME_TYPES.has(record.mime_type))
      .slice(0, Math.min(limit, 20));
    const result = { attempted: [] as string[], parsed: [] as string[], failed: [] as string[] };
    for (const artifact of failedArtifacts) {
      result.attempted.push(artifact.id);
      const parsed = await this.parseArtifactWithMinerU(artifact.id, actor);
      (parsed.status === "parsed" ? result.parsed : result.failed).push(artifact.id);
    }
    await this.appendAudit({ type: "retry_failed_parses", actor, ...result });
    return result;
  }

  async reconcileMemory(input: { memory_id: string; action: "add_evidence" | "narrow_scope" | "propose_supersession" | "revalidate"; rationale: string; evidence_refs?: string[]; narrowed_scope?: string; proposed_supersedes?: string; actor: string }): Promise<{ memory_id: string; status: ValidationDecision; validation_event_id: string; remediation?: string }> {
    const current = await this.get(input.memory_id);
    if (!current || current.record.type !== "memory") throw new Error(`Unknown memory: ${input.memory_id}`);
    const memory = current.record;
    const next: KnowledgeRecord = { ...memory, created_by: memory.created_by };
    if (input.action === "add_evidence") next.evidence_refs = [...new Set([...(Array.isArray(memory.evidence_refs) ? memory.evidence_refs.filter((ref): ref is string => typeof ref === "string") : []), ...(input.evidence_refs ?? [])])];
    if (input.action === "narrow_scope") {
      if (!input.narrowed_scope) throw new Error("narrow_scope requires narrowed_scope");
      next.scope = input.narrowed_scope;
    }
    if (input.action === "propose_supersession") {
      if (!input.proposed_supersedes) throw new Error("propose_supersession requires proposed_supersedes");
      const target = await this.get(input.proposed_supersedes);
      if (!target || target.record.type !== "memory") throw new Error("proposed_supersedes must reference an existing memory");
      next.supersedes = target.record.id;
      next.status = "candidate";
    }
    await this.upsertRecord({ ...next, reconciliation_action: input.action, reconciliation_rationale: input.rationale, reconciled_at: now() }, current.body);
    const verdict = await this.validateAndStore({ ...next, status: "candidate" }, input.actor);
    await this.appendAudit({ type: "memory_reconcile", memory_id: memory.id, action: input.action, actor: input.actor, validation_event_id: verdict.eventId });
    return { memory_id: memory.id, status: verdict.status, validation_event_id: verdict.eventId, remediation: verdict.remediation };
  }

  async readResource(uriOrId: string, maximumConfidentiality: Confidentiality = "internal"): Promise<{ uri: string; title: string; text: string }> {
    if (uriOrId.startsWith("kb://project/")) {
      const id = decodeURIComponent(uriOrId.split("/")[3] ?? "");
      const brief = await this.brief(id);
      return { uri: uriOrId, title: `Project brief ${id}`, text: YAML.stringify(brief) };
    }
    const parts = uriOrId.startsWith("kb://") ? uriOrId.split("/") : [];
    if (parts.length >= 4 && parts[2] === "artifact") {
      const artifactId = decodeURIComponent(parts[3] ?? "");
      const artifact = await this.get(artifactId);
      if (!artifact || artifact.record.type !== "artifact") throw new Error(`Artifact resource not found: ${uriOrId}`);
      if (!confidentialityAllowed(artifact.record, maximumConfidentiality)) throw new Error("Resource is outside this profile's confidentiality scope");
      if (parts[4] === "document" || parts[4] === "page") {
        const normalized = artifact.record.normalized_markdown_path;
        if (typeof normalized !== "string") throw new Error(`Artifact has no normalized Markdown: ${artifactId}`);
        const fullText = await readFile(join(this.root, normalized), "utf8");
        if (parts[4] !== "page") return { uri: uriOrId, title: artifact.record.title, text: fullText };
        const page = Number(parts[5]);
        if (!Number.isInteger(page) || page < 1) throw new Error("Artifact page must be a positive integer");
        const matches = [...fullText.matchAll(/^## Page (\d+)\s*$/gm)];
        const start = matches.findIndex(match => Number(match[1]) === page);
        if (start < 0) throw new Error(`Page ${page} is not addressable in this normalized artifact`);
        const offset = matches[start]!.index ?? 0;
        const end = matches[start + 1]?.index ?? fullText.length;
        return { uri: uriOrId, title: `${artifact.record.title} — page ${page}`, text: fullText.slice(offset, end).trim() };
      }
      if (parts[4] === "image") {
        const imageIdx = Number(parts[5]);
        const imageAssociations = artifact.record.image_associations as ImageAssociation[] | undefined;
        if (!imageAssociations || imageAssociations.length === 0) throw new Error(`Artifact has no image associations: ${artifactId}`);
        if (!Number.isInteger(imageIdx) || imageIdx < 0 || imageIdx >= imageAssociations.length) throw new Error(`Image index ${imageIdx} is not addressable in this artifact (0–${imageAssociations.length - 1})`);
        const ia = imageAssociations[imageIdx]!;
        return { uri: uriOrId, title: `${artifact.record.title} — image ${imageIdx}`, text: YAML.stringify({ resource_uri: ia.resource_uri, alt_text: ia.alt_text, caption: ia.caption, page: ia.page, slide: ia.slide, section: ia.section }) };
      }
      return { uri: uriOrId, title: artifact.record.title, text: renderRecord(artifact.record, artifact.body) };
    }
    const id = parts.length >= 4 ? decodeURIComponent(parts.slice(3).join("/")) : uriOrId;
    const item = await this.get(id);
    if (!item) throw new Error(`Knowledge resource not found: ${uriOrId}`);
    if (!confidentialityAllowed(item.record, maximumConfidentiality)) throw new Error("Resource is outside this profile's confidentiality scope");
    return { uri: uriOrId.startsWith("kb://") ? uriOrId : `kb://record/${encodeURIComponent(item.record.id)}`, title: item.record.title, text: renderRecord(item.record, item.body) };
  }

  async health(): Promise<Record<string, unknown>> {
    const records = (await this.records()).map(item => item.record);
    return {
      status: "ok", records: records.length, parsed_artifacts: records.filter(record => record.type === "artifact" && record.status === "parsed").length,
      failed_artifacts: records.filter(record => record.type === "artifact" && record.status === "failed").length,
      stale_artifacts: records.filter(record => record.type === "artifact" && record.status === "stale").length,
      quarantined: records.filter(record => record.status === "quarantined").length,
      disputed: records.filter(record => record.status === "disputed").length,
      ingestion_jobs: records.filter(record => record.type === "ingestion_job").length, policy_version: POLICY_VERSION,
    };
  }
}

export function resolveProjectProfile(value: string | undefined): ProjectProfile {
  if (value === "project-read" || value === "project-maintain" || value === "project-admin" || value === "upstream-full") return value;
  return "upstream-full";
}

export function resolveProjectRoot(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}
