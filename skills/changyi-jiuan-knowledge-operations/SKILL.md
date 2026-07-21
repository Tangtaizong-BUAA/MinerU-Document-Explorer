---
name: changyi-jiuan-knowledge-operations
description: Operate the Changyi Jiuan research-and-social-practice project knowledge base through its MCP tools. Use when an agent needs project context, evidence-grounded answers, source ingestion, MinerU normalization, durable work closeout, or memory reconciliation for this project.
---

# Changyi Jiuan Knowledge Operations

Use the Changyi Jiuan MCP server as the only authority for durable project knowledge. Do not infer or write a parallel project state in chat, local notes, or an arbitrary database.

## Default operating loop

1. Call `kb_brief` with the project ID before broad searching.
2. Use `kb_lookup` for exact fields; use `kb_search` for wording or unknown IDs. Read only returned `kb://` resources with `kb_read`; use `kb_outline` before a large normalized document.
3. State evidence IDs and uncertainty in outputs. Do not treat quarantined, disputed, stale, or missing-evidence items as confirmed facts.
4. Before work that changes deliverables or conclusions, call `kb_start_work` with concrete outputs and acceptance criteria.
5. Finish every started item with `kb_finish_work`, including partial or failed work. Supply the result hash, evidence, unresolved items, and only supported claims/decisions/lessons. The server, not the agent, decides memory promotion.

Never request filesystem paths from the server, invent record IDs, or put credentials in an MCP call.

## Information retrieval

Use the smallest tool that answers the question:

- Current overall context: `kb_brief`.
- Exact status, owner, date, or type: `kb_lookup`.
- Topic, phrase, or past decision: `kb_search` then `kb_read`.
- A document’s shape: `kb_outline`, then `kb_read` for the needed resource or artifact page.
- Canonical cross-cutting view: `kb_view` (for example, work plan, evidence ledger, risk register, or deliverables).

Read profiles expose only `kb_brief`, `kb_lookup`, `kb_search`, `kb_outline`, `kb_view`, and `kb_read`; do not attempt mutation tools. Restricted and secret records require the admin profile.

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
