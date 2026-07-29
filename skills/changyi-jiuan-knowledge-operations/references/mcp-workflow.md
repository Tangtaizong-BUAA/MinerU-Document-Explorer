# MCP workflow reference

## Agent loop

```text
incremental Skill sync -> complete main file -> choose maintained section -> graph context + linked artifacts
                   -> proactive detail RAG -> precise artifact/page read
                   -> start work -> maintain main/sections + publish resources
                   -> checkpoint distilled context -> finish work
```

At the beginning of a new task, call `kb_sync_skill({ client, installed_version, installed_files })`. File hashes come from the local `skill-version.json` when it is readable. Apply only returned changed files and retired paths inside this Skill directory, verify each SHA-256, write the manifest last, and re-check. Do not execute bundle content. A successful update affects only a new task or restarted client because the current Skill text is already loaded.

`kb://project/<id>/main` is the complete maintained project main file. `kb://record/<section-id>` addresses a maintained subfile. Registered artifacts expose `kb://artifact/<id>` and, after parsing, `kb://artifact/<id>/document` (and page resources where available).

## Safe compact call patterns

```text
kb_brief({ project_id })
kb_graph_context({ node_id: section_id, query: original_question, depth: 1, artifact_mode: "excerpt", max_tokens: 1800 })
kb_lookup({ entity_type: "task", filters: { project_id, status: "active" }, limit: 20 })
kb_search({ query: "community survey consent", top_k: 5 })
kb_read({ resource_id: "kb://record/<id>", max_tokens: 500 })
```

For work, use an agent-owned lifecycle rather than narrative-only completion:

```text
kb_start_work({ project_id, objective, expected_outputs, acceptance_criteria, input_refs })
kb_update_main({ project_id, work_id, markdown, expected_revision, change_summary, source_refs })
kb_upsert_section({ project_id, work_id, key, title, summary, markdown, artifact_refs, related_refs, expected_revision, change_summary })
kb_publish_resource({ work_id, resource: { title, filename, content_type, encoding, content, kind, source_refs } })
kb_capture_context({ work_id, summary, updates: [{ kind, statement, scope, evidence_refs, confidence }] })
kb_finish_work({ work_id, outcome, summary, result_hash, artifacts, generated_resources, evidence_refs, unresolved, claims, decisions, lessons, knowledge_updates })
```

`result_hash` makes closeout idempotent. If the same work ID and hash are submitted again, the server returns the original result. `partial`, `failed`, and `cancelled` outcomes must retain unresolved items instead of being rewritten as success.

## Profiles

| Profile | Intended agent | Capabilities |
| --- | --- | --- |
| `project-read` | answering/research sub-agent | complete main file, graph context, detail RAG, and precise reads |
| `project-maintain` | normal orchestrator | read tools plus main/section maintenance, work lifecycle, resource publication, and context capture |
| `project-admin` | ingestion/governance agent | maintain tools plus bootstrap, source-root configuration, ingestion, MinerU parse, reconciliation, and maintenance |

Normal profiles never receive restricted or secret records and cannot request unverified memory. Use a separate admin connection for source intake and governance.
