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

只有 ingestion/governance 的 `project-admin` 连接需要 MinerU 环境：将 `MINERU_API_KEY` 注入其运行环境，安装 `mineru-open-sdk`；若它不在默认 `python3` 中，再额外设置 `CYJ_PYTHON_BIN` 指向该解释器。上述凭据与绝对路径均不得提交到仓库。

Codex、Qoder 和 Hermes Agent 均使用此标准形态。需要共享服务时，Hermes 可启动 `qmd mcp --http --port 8181`，仅绑定 localhost；项目 profile 的旧 `/query` 与 `/search` REST 接口被服务器拒绝，所有工作走 `/mcp`。

项目还提供可随仓库分发的 Agent Skill：[`skills/changyi-jiuan-knowledge-operations/`](../../skills/changyi-jiuan-knowledge-operations/)。将其放入客户端可发现的 skills 目录，或在任务提示中显式要求使用 `$changyi-jiuan-knowledge-operations`。它把“先 brief、再精确检索、工作必须 closeout”的默认循环交给 Agent；MCP Server 仍是唯一的数据与权限裁决者。

## 服务器部署

推荐用 [`deploy/systemd/changyi-jiuan-mcp.service`](../../deploy/systemd/changyi-jiuan-mcp.service) 部署为独立的 `changyi-kb` 用户服务。它使用 Node 22+，只监听 `127.0.0.1:8793`，不改 Nginx；本地客户端通过 SSH 隧道访问：

```bash
ssh -N -L 8793:127.0.0.1:8793 root@your-server
```

服务的 MinerU 凭据仅放入服务器 `/etc/changyi-jiuan-mcp.env`（模板见 [`changyi-jiuan-mcp.env.example`](../../deploy/systemd/changyi-jiuan-mcp.env.example)），权限应为 `root:changyi-kb` 和 `0640`。不要使用已暴露在聊天中的旧凭据。

### 内部共享 HTTPS 入口

服务器可将 MCP 以 `https://argonai.cn/cyj/mcp` 提供给内部人员的 Agent。它仍由 loopback 服务承载，Nginx 只代理此精确路径；每个客户端必须在请求中携带同一份私有环境变量：

```text
Authorization: Bearer $CYJ_MCP_BEARER_TOKEN
```

`CYJ_MCP_BEARER_TOKEN` 只保存在服务器 `/etc/changyi-jiuan-mcp.env` 与受信任客户端的本地环境中。不要把它粘贴进 URL、MCP JSON 或 Git。无 Token 请求必须返回 `401`；带 Token 的标准 MCP `initialize` 必须返回 `200`。

## 最小验收

1. 客户端完成 MCP capability discovery；
2. `project-read` 只出现 `kb_brief/kb_lookup/kb_search/kb_outline/kb_view/kb_read`；
3. `project-maintain` 额外出现 `kb_start_work/kb_finish_work`；
4. closeout 产生 audit event，重试同一 `work_id + result_hash` 返回相同结果；
5. `project-admin` 才出现项目 bootstrap、source root 配置、摄取、MinerU 解析、记忆调解与维护工具。
