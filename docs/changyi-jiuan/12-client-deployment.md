# 12 三客户端部署

> 0.5.0 迁移说明：本文首先记录当前 0.4 客户端能力。0.5 将外部客户端的 canonical 文档直接写入收口到独立维护 Worker；迁移完成前不得把现有 `kb_update_main/kb_upsert_section` 描述为已经移除。目标边界见 [11-v0.5-product-technology-stack.md](11-v0.5-product-technology-stack.md)。
>
> 0.5 发布门禁：团队公网主节点必须从当前 `project-admin` 切为 `project-contribute`；`project-resolve` 使用独立 capability；摄取/重建只在家庭 loopback 的 `project-ops`；阿里回退保持 `project-read`。已载入 0.4 Skill 的在途任务通过 proposal-only legacy shim 收尾，旧工具名不得直接写 canonical。机器可读矩阵见 [specs/mcp-surface.v0.5.yaml](specs/mcp-surface.v0.5.yaml)。

三个客户端都使用同一份标准 MCP stdio 配置，差异只在各客户端的 MCP 配置入口。模板位于 `deploy/mcp/`；将 `__ABSOLUTE_KNOWLEDGE_DATA_ROOT__` 替换为真实数据根目录，禁止把该目录或 API Key 提交到仓库。

团队默认使用 `project-contribute`：可完整读取主文件、通过图谱读取分文件及其 artifacts、主动执行细节 RAG、启动工作、归档产物、closeout 和自动记忆回传；主/分文件由服务器维护 Worker 异步整理。只读子 Agent 使用 `project-read`；负责人/指定负责人使用独立 `project-resolve` principal；资料摄取和重建只使用家庭 loopback 的 `project-ops`。

```json
{
  "mcpServers": {
    "changyi-jiuan": {
      "command": "qmd",
      "args": ["mcp"],
      "env": {
        "CYJ_MCP_PROFILE": "project-contribute",
        "CYJ_KB_ROOT": "/absolute/path/to/knowledge-data"
      }
    }
  }
}
```

只有家庭 loopback 的 `project-ops` 与维护 Worker 需要 MinerU/MS-Agent 环境：分别通过 `MINERU_API_KEY`、`DASHSCOPE_API_KEY` 注入，安装 `mineru-open-sdk` 与 `ms-agent==1.6.0`；设置 `CYJ_PYTHON_BIN/CYJ_MAINTENANCE_PYTHON` 指向隔离解释器。上述凭据与绝对路径均不得提交到仓库。

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
4. `project-contribute` 额外出现 `kb_start_work/kb_publish_resource/kb_capture_context/kb_finish_work`，不出现直接 canonical patch；
5. `project-resolve` 额外出现 `kb_submit_user_resolution`，且只有 owner/designated-resolver principal 能初始化；
5. closeout 产生 audit event，重试同一 `work_id + result_hash` 返回相同结果；
6. `project-ops` 才出现项目 bootstrap、source root 配置、摄取、MinerU 解析与维护工具。

## 家庭主节点与阿里云回退

资源受限的家庭服务器使用项目专用轻量入口 `dist/cli/project-mcp-http.js`。查询进程加载项目运行时、MCP SDK、YAML、Zod 与持久队列；MS-Agent 只在独立 Worker 中运行。`project-ops` 工具、`kb://` 资源、Skill 增量同步和 MinerU 云 API 保留。可复现镜像定义位于 `deploy/home/`。

生产拓扑遵守单写者原则：

1. `https://argonai.cn/cyj/mcp` 始终是客户端唯一入口；阿里云 Nginx 负责 HTTPS 与上游选择。
2. 家庭服务器的团队 `project-contribute` 服务绑定宿主机 `127.0.0.1:8793`，通过受限 IPv6/SSH 私有转发映射到阿里云回环端口；`project-ops` 使用另一 loopback-only 端口和 service principal，绝不经团队入口暴露。
3. 阿里云另起 `project-read` 回退服务，读取家庭节点的定期只读快照。家庭上游不可达时，新的 MCP 会话可自动回退并继续只读检索，使客户端 Agent 能继续回答；回退服务本身不回答问题，也不暴露写入、摄取或记忆维护工具。
4. 已连接到失效主节点的会话需要由客户端重新初始化。禁止把同一会话 ID 跨节点伪装迁移。
5. 家庭节点恢复后，先确认数据一致性，再让新会话重新优先家庭节点；回退节点不得接受写入，避免故障窗口形成双写分叉。
6. 阿里云只保留 `project-read` 快照与切换前回滚点，不进入自动双写或自动反向合并。

家庭容器默认限制为 384 MiB 内存、768 MiB 内存加 swap、1.5 CPU、128 个进程，并启用只读根文件系统、`no-new-privileges`、会话过期回收和独立健康检查。`/data` 是唯一知识写卷；访问令牌和 MinerU 凭据仍只通过 `/etc/changyi-jiuan-mcp.env` 注入。

切换顺序必须是：阿里云数据与配置快照 → 家庭节点部署 → 影子路径完整验收 → 只读回退验收 → 故障注入 → 正式 Nginx 原子替换与 reload。任一阶段失败时，不修改正式入口。

阿里云端可复现单元位于 `deploy/systemd/`：`changyi-jiuan-home-tunnel.service` 维护主链路，`changyi-jiuan-mcp-standby.service` 提供只读回退，`changyi-jiuan-standby-sync.{service,timer}` 单向刷新快照，`cyj-frp-loopback-firewall.service` 封锁转发端口的非回环访问。Nginx 上游模板位于 `deploy/nginx/changyi-jiuan-home-primary.conf.example`。
