# 12 三客户端部署

三个客户端都使用同一份标准 MCP stdio 配置，差异只在各客户端的 MCP 配置入口。模板位于 `deploy/mcp/`；将 `__ABSOLUTE_KNOWLEDGE_DATA_ROOT__` 替换为真实数据根目录，禁止把该目录或 API Key 提交到仓库。

默认使用 `project-maintain`：可完整读取主文件、通过图谱读取分文件及其 artifacts、主动执行细节 RAG、维护主/分文件、启动工作、归档产物、closeout 和自动记忆回传。只读子 Agent 使用 `project-read`；资料摄取和治理 Agent 使用独立的 `project-admin` 配置，不与普通编排器共用。

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

项目还提供可随仓库分发的 Agent Skill：[`skills/changyi-jiuan-knowledge-operations/`](../../skills/changyi-jiuan-knowledge-operations/)。将其放入客户端可发现的 skills 目录，或在任务提示中显式要求使用 `$changyi-jiuan-knowledge-operations`。它把“增量版本同步 → 完整主文件 → 分文件与链接 artifacts → 主动细节 RAG → 维护主/分文件 → 工作 closeout”的默认循环交给 Agent；MCP Server 仍是唯一的数据与权限裁决者。

### Skill 自动增量更新

项目 profile 的 MCP 初始化信息、工具定义和每个工具结果均返回服务版本、要求的 Skill 版本和 bundle SHA-256。每个新任务中，Agent 先调用 `kb_sync_skill`，上报已安装版本和 `skill-version.json` 的文件哈希；只有差异文件才会回传。Agent 在自己的 Skill 目录内临时写入、校验、替换，并在下一任务启用新指令。

Codex 的默认目录为 `${CODEX_HOME:-~/.codex}/skills/changyi-jiuan-knowledge-operations`。Qoder、Hermes 使用各自当前已加载的 Skill 根目录，由客户端配置解析，服务端不猜测也不接收绝对路径。若客户端沙箱禁止写入，Agent 必须报告权限边界；远端 MCP 不绕过客户端安全机制。

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

1. 客户端完成 MCP capability discovery，server version 与 required Skill version 一致；
2. `kb_sync_skill` 对所有项目 profile 可见，0.3.0 客户端只收到变化文件，当前版本不收到正文；
3. `project-read` 只出现 `kb_sync_skill/kb_brief/kb_graph_context/kb_lookup/kb_search/kb_outline/kb_view/kb_read`；
4. `project-maintain` 额外出现 `kb_start_work/kb_update_main/kb_upsert_section/kb_publish_resource/kb_capture_context/kb_finish_work`；
5. closeout 产生 audit event，重试同一 `work_id + result_hash` 返回相同结果；
6. `project-admin` 才出现项目 bootstrap、source root 配置、摄取、MinerU 解析、记忆调解与维护工具。
