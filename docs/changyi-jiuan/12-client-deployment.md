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

## 家庭主节点与阿里云回退

资源受限的家庭服务器使用项目专用轻量入口 `dist/cli/project-mcp-http.js`。它只加载项目运行时、MCP SDK、YAML 和 Zod，不加载完整 QMD 的 SQLite、向量、本地模型与重排依赖；`project-admin` 工具、`kb://` 资源、Skill 增量同步和 MinerU 云 API 仍然保留。可复现镜像定义位于 `deploy/home/`，`deploy/scripts/package-lightweight-mcp.sh` 会生成只包含所需编译产物和 SHA-256 清单的部署目录。

生产拓扑遵守单写者原则：

1. `https://argonai.cn/cyj/mcp` 始终是客户端唯一入口；阿里云 Nginx 负责 HTTPS 与上游选择。
2. 家庭服务器的 `project-admin` 轻量容器绑定宿主机 `127.0.0.1:8793`，通过受限私有转发映射到阿里云回环端口。当前生产使用 `changyi-jiuan-home-tunnel.service`，复用现有 SSH/frp 链路且密钥只允许连接该端口；也可在维护窗口切换为专用 frp TCP 代理。阿里云转发端口必须拒绝非 loopback 访问。
3. 阿里云另起 `project-read` 回退服务，读取家庭节点的定期只读快照。家庭上游不可达时，新的 MCP 会话可自动回退并继续问答，但不暴露写入、摄取或记忆维护工具。
4. 已连接到失效主节点的会话需要由客户端重新初始化。禁止把同一会话 ID 跨节点伪装迁移。
5. 家庭节点恢复后，先确认数据一致性，再让新会话重新优先家庭节点；回退节点不得接受写入，避免故障窗口形成双写分叉。
6. 阿里云原 `project-admin` 服务和切换前数据快照保留为人工回滚点，不进入自动双写或自动反向合并。

家庭容器默认限制为 384 MiB 内存、768 MiB 内存加 swap、1.5 CPU、128 个进程，并启用只读根文件系统、`no-new-privileges`、会话过期回收和独立健康检查。`/data` 是唯一知识写卷；访问令牌和 MinerU 凭据仍只通过 `/etc/changyi-jiuan-mcp.env` 注入。

切换顺序必须是：阿里云数据与配置快照 → 家庭节点部署 → 影子路径完整验收 → 只读回退验收 → 故障注入 → 正式 Nginx 原子替换与 reload。任一阶段失败时，不修改正式入口。

阿里云端可复现单元位于 `deploy/systemd/`：`changyi-jiuan-home-tunnel.service` 维护主链路，`changyi-jiuan-mcp-standby.service` 提供只读回退，`changyi-jiuan-standby-sync.{service,timer}` 单向刷新快照，`cyj-frp-loopback-firewall.service` 封锁转发端口的非回环访问。Nginx 上游模板位于 `deploy/nginx/changyi-jiuan-home-primary.conf.example`。
