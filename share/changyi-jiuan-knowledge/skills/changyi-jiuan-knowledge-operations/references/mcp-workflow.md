# MCP 工作流参考

## 最小调用顺序

```text
kb_sync_skill -> kb_brief -> kb_graph_context -> 主动 kb_search
              -> kb_start_work -> 维护/产物/知识回传 -> kb_finish_work
```

## 文件级增量更新

调用示例：

```text
kb_sync_skill({
  client: "codex",
  installed_version: "0.5.0",
  installed_files: [
    { path: "SKILL.md", sha256: "..." },
    { path: "agents/openai.yaml", sha256: "..." },
    { path: "references/mcp-workflow.md", sha256: "..." }
  ]
})
```

状态含义：

- `current`：版本与文件哈希一致，继续项目工作。
- `current_version_unverified`：版本一致但未提供文件哈希；可以继续，下一次应读取本地 manifest 做完整校验。
- `update_required`：只应用 `delta.files` 和 `delta.remove_paths`，校验后再次调用本工具。

`delta.files` 每项只包含允许写入本 Skill 的相对路径、UTF-8 内容、文件 SHA-256 和大小。Agent 必须拒绝绝对路径、`..`、未知根目录和哈希不一致。`delta.remove_paths` 只会来自服务器保存的旧版受管清单，不得据此清理用户自建文件。

更新是客户端文件操作，不会热替换已经进入当前上下文的 Skill。更新成功后继续当前任务，并在交付时提示下一任务自动使用新版本。

## 项目知识循环

- `kb_brief({ project_id })`：完整主文件与分文件导航。
- `kb_graph_context({ node_id, query, depth: 1, artifact_mode: "excerpt" })`：分文件、图谱与关联 artifacts。
- `kb_search({ query, top_k })`：人名、数字、日期、版本、原文、表格、图片和证据的主动细节 RAG。
- `kb_start_work`：创建受审计工作项。
- `kb_publish_resource` / `kb_capture_context`：持久化产物和提炼后的对话知识。
- `kb_finish_work`：幂等关单并记录证据、未解决项和结果哈希。
- `kb_submit_user_resolution`：仅负责人/指定负责人的独立 resolver principal 可用；锁定原话并入队，不能直接闭合冲突。

主文件、分文件和拓扑由服务器 Maintenance Worker 根据上述增量异步整理。legacy `kb_update_main/kb_upsert_section` 只返回 proposal packet，不代表 canonical 已更新。

非 resolver 成员收到用户对冲突的临时回答时，可以据此完成当前回复，但禁止把该回复放入 capture、closeout、resource 或任何持久调用。
