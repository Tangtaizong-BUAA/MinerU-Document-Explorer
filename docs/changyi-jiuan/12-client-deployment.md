# 12 三客户端部署

三个客户端都使用同一份标准 MCP stdio 配置，差异只在各客户端的 MCP 配置入口。模板位于 `deploy/mcp/`；将 `__ABSOLUTE_KNOWLEDGE_DATA_ROOT__` 替换为真实数据根目录，禁止把该目录或 API Key 提交到仓库。

默认使用 `project-maintain`：可检索、启动工作、closeout 和自动记忆回传。只读子 Agent 使用 `project-read`；资料摄取和治理 Agent 使用独立的 `project-admin` 配置，不与普通编排器共用。

```json
{
  "mcpServers": {
    "changyi-jiuan": {
      "command": "qmd",
      "args": ["mcp"],
      "env": {
        "CYJ_MCP_PROFILE": "project-maintain",
        "CYJ_KB_ROOT": "/absolute/path/to/knowledge-data"
      }
    }
  }
}
```

Codex、Qoder 和 Hermes Agent 均使用此标准形态。需要共享服务时，Hermes 可启动 `qmd mcp --http --port 8181`，仅绑定 localhost；项目 profile 的旧 `/query` 与 `/search` REST 接口被服务器拒绝，所有工作走 `/mcp`。

## 最小验收

1. 客户端完成 MCP capability discovery；
2. `project-read` 只出现 `kb_brief/kb_lookup/kb_search/kb_outline/kb_view/kb_read`；
3. `project-maintain` 额外出现 `kb_start_work/kb_finish_work`；
4. closeout 产生 audit event，重试同一 `work_id + result_hash` 返回相同结果；
5. `project-admin` 才出现项目 bootstrap、source root 配置、摄取、MinerU 解析、记忆调解与维护工具。
