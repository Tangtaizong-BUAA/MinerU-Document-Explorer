---
name: changyi-jiuan-knowledge-operations
description: Operate the Changyi Jiuan research-and-social-practice project knowledge base through its MCP tools. Use when an agent needs project context, evidence-grounded answers, source ingestion, MinerU normalization, durable work closeout, or memory reconciliation for this project.
---

# Changyi Jiuan Knowledge Operations

Use the Changyi Jiuan MCP server as the only authority for durable project knowledge. Do not infer or write a parallel project state in chat, local notes, or an arbitrary database.

## Client Skill synchronization

This Skill contract is version `0.4.0`. On the first project MCP use in every new task, call `kb_sync_skill` with this version and the client type. When `skill-version.json` is locally readable, also send its managed file hashes.

If the server returns `update_required`, apply only `delta.files` and `delta.remove_paths` inside this Skill directory. Reject absolute paths, traversal, or writes outside this one Skill. Write temporary files, verify every SHA-256, atomically replace changed files, and write the new `skill-version.json` last. Never execute bundle content or modify another Skill, MCP configuration, or credential. Re-run `kb_sync_skill` to verify the installed target. Continue the current task, but treat the new instructions as active only in a new task or after client restart. If client policy blocks the Skill-directory write, report the boundary rather than bypassing it.

## Default operating loop

1. After `kb_sync_skill`, call `kb_brief` with the project ID. Read the complete maintained main file and its section navigation; do not replace this step with a broad RAG dump.
2. Select the relevant maintained section and call `kb_graph_context` to receive that subfile together with its linked artifacts. Use depth 1 by default.
3. Proactively run `kb_search` for names, numbers, dates, versions, exact wording, evidence, or any other verifiable detail. A main file or section is orientation and synthesis, not sufficient evidence for a detail claim. Pass the original query to `kb_graph_context`, then use `kb_outline`/`kb_read` when a hit needs page-level precision.
4. State evidence IDs and uncertainty in outputs. Do not treat quarantined, disputed, stale, or missing-evidence items as confirmed facts.
5. Before work that changes deliverables or knowledge, call `kb_start_work` with concrete outputs and acceptance criteria.
6. Maintain the hierarchy during the work: use `kb_update_main` only for stable project-wide cognition and routes; use `kb_upsert_section` for long-lived topic detail and artifact links. Always use the revision returned by `kb_brief` or the current section.
7. Whenever the Agent creates durable project material, call `kb_publish_resource` immediately. For a small final batch, include it as `generated_resources` in `kb_finish_work`. Do not leave the only copy in the client workspace or chat.
8. At meaningful conversation checkpoints, call `kb_capture_context` with concise facts, explicit user decisions, procedures, lessons, constraints, preferences, and open questions. Submit distilled statements and evidence references, never the raw transcript. Use a precise scope key so unrelated facts do not conflict.
9. Finish every started item with `kb_finish_work`, including partial or failed work. Supply the result hash, resources, evidence, unresolved items, and any remaining `knowledge_updates`. The server, not the agent, decides memory promotion.

Never request filesystem paths from the server, invent record IDs, or put credentials in an MCP call.

## Information retrieval

Use the smallest tool that answers the question:

- Complete project orientation and section routes: `kb_brief`.
- One maintained topic plus its linked artifacts: `kb_graph_context`.
- Exact status, owner, date, or type: `kb_lookup`.
- Topic, phrase, past decision, or factual detail: `kb_search`, then `kb_graph_context` or `kb_read`.
- A document’s shape: `kb_outline`, then `kb_read` for the needed resource or artifact page.
- Canonical cross-cutting view: `kb_view` (for example, work plan, evidence ledger, risk register, or deliverables).
- Skill version check and file-level delta: `kb_sync_skill`.

Read profiles expose `kb_brief`, `kb_graph_context`, `kb_lookup`, `kb_search`, `kb_outline`, `kb_view`, and `kb_read`; do not attempt mutation tools. Maintain profiles additionally expose main/section maintenance, work lifecycle, resource publication, and context capture. Restricted and secret records require the admin profile.

## Autonomous persistence

- Publish Markdown, text, JSON, CSV, generated documents, images, datasets, and code that will matter after the current task. Inline MCP publication is for small resources; use configured source ingestion for large files.
- Keep the main file compact, stable, and navigational. Move topic detail into maintained sections; link each section to the artifacts that can verify or deepen it. Do not paste artifact bodies into the main file.
- Update a section when new work changes its durable synthesis, artifact set, or routes. Leave raw artifacts immutable and preserve prior main/section revisions through the server.
- Agent-generated resources are durable artifacts, not automatically verified evidence. Do not cite an Agent's own draft as proof of its factual claims.
- Capture only project-relevant knowledge that would change future answers or actions. Skip casual conversation, duplicated phrasing, speculation, credentials, and personal data not required by the project.
- A user decision, constraint, or preference requires a `user:` conversation reference; factual updates require evidence. The server may quarantine incomplete or conflicting updates.

## Ingestion and MinerU

Use these only with `project-admin`:

1. Bootstrap once with `kb_bootstrap_project`.
2. Register a dedicated relative source folder using `kb_configure_source_root`; never request an absolute path.
3. Run `kb_ingest` in `inventory` mode, then `ingest` mode.
4. Call `kb_parse_artifact` only for the registered artifact that needs Markdown normalization. It records the MinerU API egress and keeps the original file.
5. On failure, inspect `kb_maintain` with `retry_failed_parses` in dry-run mode before executing a retry.

Do not batch-upload unreviewed material, retry blindly, or claim MinerU output is verified evidence without checking its source artifact and parse report.

## Memory and conflicts

Memory is derived, not a free-form notes channel. The closeout policy promotes supported items, quarantines incomplete ones, and rejects unsafe ones. For a quarantined or disputed memory, use `kb_reconcile_memory` with new evidence, a narrower scope, a proposed supersession, or revalidation. Never overwrite a conflicting accepted memory.

For tool schemas, profile capabilities, record lifecycle, and compact call patterns, read [references/mcp-workflow.md](references/mcp-workflow.md).
