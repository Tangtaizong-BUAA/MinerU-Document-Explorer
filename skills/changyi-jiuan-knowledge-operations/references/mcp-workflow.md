# MCP workflow reference

## Agent loop

```text
brief -> lookup/search -> read only what is needed -> answer or start work
                                                -> finish work -> policy-controlled memory
```

`kb://record/<id>` is the stable URI for a record. `kb://project/<id>/brief` is the compact project brief. Registered artifacts additionally expose `kb://artifact/<id>` and, after parsing, `kb://artifact/<id>/document` (and page resources where available).

## Safe compact call patterns

```text
kb_brief({ project_id, max_tokens: 400 })
kb_lookup({ entity_type: "task", filters: { project_id, status: "active" }, limit: 20 })
kb_search({ query: "community survey consent", top_k: 5 })
kb_read({ resource_id: "kb://record/<id>", max_tokens: 500 })
```

For work, use an agent-owned lifecycle rather than narrative-only completion:

```text
kb_start_work({ project_id, objective, expected_outputs, acceptance_criteria, input_refs })
kb_finish_work({ work_id, outcome, summary, result_hash, artifacts, evidence_refs, unresolved, claims, decisions, lessons })
```

`result_hash` makes closeout idempotent. If the same work ID and hash are submitted again, the server returns the original result. `partial`, `failed`, and `cancelled` outcomes must retain unresolved items instead of being rewritten as success.

## Profiles

| Profile | Intended agent | Capabilities |
| --- | --- | --- |
| `project-read` | answering/research sub-agent | compact read-only knowledge tools |
| `project-maintain` | normal orchestrator | read tools plus `kb_start_work` and `kb_finish_work` |
| `project-admin` | ingestion/governance agent | maintain tools plus bootstrap, source-root configuration, ingestion, MinerU parse, reconciliation, and maintenance |

Normal profiles never receive restricted or secret records and cannot request unverified memory. Use a separate admin connection for source intake and governance.
