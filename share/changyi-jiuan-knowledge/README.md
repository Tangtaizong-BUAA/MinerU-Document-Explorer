# 长翼久安知识库mcp工具

这个文件夹可直接分享给团队成员。它是纯客户端接入包，只包含 MCP 声明、Agent Skill、安装脚本和可交给 Agent 的安装提示词。

不包含服务端源码、访问令牌、项目原件、任何本地数据库、私钥或云 API Key。

## 团队成员安装

1. 从项目管理员处通过安全渠道取得团队 MCP 访问令牌；不要把令牌写进聊天、Git、共享文件夹或截图。
2. 将本文件夹复制到本机任意位置。你也可以直接把 [PROMPT-FOR-AGENT.md](PROMPT-FOR-AGENT.md) 和本文件夹交给当前 Agent。
3. 根据客户端运行：

```bash
cd /path/to/changyi-jiuan-knowledge
bash scripts/install.sh codex
bash scripts/install.sh qoder
bash scripts/install.sh hermes
```

只运行与你使用的客户端对应的一行。脚本会静默要求输入令牌，将内置 Skill 增量安装到客户端的用户级 Skill 目录，并把 `changyi_jiuan_knowledge` 注册为远程 HTTPS MCP。未变化的 Skill 文件不会重写。

- Codex 使用 `bearer_token_env_var`，令牌不会进入 Codex 配置文件。
- Qoder 的静态 Header 鉴权按官方远程 HTTP MCP 格式写入本机用户配置，文件权限设为 `0600`；不会写回安装包。
- Hermes 将令牌写入本机 `~/.hermes/.env`（`0600`），配置中只保留环境变量引用。

4. 重启或重载客户端，打开一个新任务。Agent 会先调用 `kb_sync_skill` 对比服务端和本地版本；若有更新，只回传并替换变化的文件，逐文件校验 SHA-256，新版本从下一任务生效。随后调用 `kb_brief` 完整读取主文件和分文件导航；按需用 `kb_graph_context` 读取分文件及其 artifacts，并对具体细节主动执行 `kb_search` RAG。在项目工作中，它会用 `kb_publish_resource` 自动归档产物、用 `kb_capture_context` 提炼对话中的长期信息；服务器维护 Worker 异步维护主文件、分文件和拓扑。

Codex 用户也可以继续使用 [PROMPT-FOR-CODEX.md](PROMPT-FOR-CODEX.md)。

## 访问与安全

- 服务地址固定为 `https://argonai.cn/cyj/mcp`，使用 Bearer Token 验证。
- 每位普通团队成员只收到一个个人 `project-contribute` Token，不含摄取运维、直接文档修改或冲突解决能力。负责人和指定负责人另领独立 resolver Token。
- 不建议多人共用一个 Token：逐人 Token 不增加成员安装步骤，但可以单独撤销并保留主体级审计。服务端只保存 Token 的 SHA-256，不保存可还原明文。
- 插件不会把令牌写入此文件夹或 Git。`install-mcp.sh` 仅把令牌注入当前 macOS 登录会话；重新登录 macOS 后需再运行一次脚本。
- Agent 不得把令牌放进 MCP 调用、知识库记录、提交信息或输出内容。

## 图片上下文

检索默认返回最小必要的文本证据。若 MinerU 输出的 Markdown 含有图片引用，`kb_search` 会附带紧凑 `visual_context`：页/幻灯片、章节、图片替代文字或说明、KB 资源 URI；不会默认传输图片字节。

现有首批导入资料尚无 MinerU 图片引用，因此不会立即返回图片上下文。要补齐旧资料的图文关联，需要以包含图片资产的 MinerU 输出重新解析并导入。

## 自动维护闭环

- 所有 MCP 工具定义和调用结果都携带服务版本、要求的 Skill 版本和 bundle hash；Agent 每个新任务自动调用 `kb_sync_skill`。
- 更新按文件哈希增量返回，只能写当前 Skill 的相对路径；未知客户端文件不会被删除，响应内容不会作为命令执行。
- 每个长翼久安相关任务先创建 `work_id`。
- 主文件长期保存项目总认知和导航；分文件长期保存科研、实践、联络、竞赛等专题信息。两者由服务器 MS-Agent 维护 Worker 提出计划，并由确定性 Harness 通过 immutable revision 控制提交。
- Agent 从主文件选择分文件；读取分文件时，服务器同步回传图谱链接的 artifact 摘录与图片上下文。具体人名、数据、版本和原文必须继续走 RAG 和证据精读。
- Agent 生成的 Markdown、报告、方案、表格、代码、图片或文档通过 MCP 上传到服务器；小型文本立即进入搜索，二进制文档可继续交给 MinerU 解析。
- 对话中形成的事实、决策、约束、偏好、经验和开放问题会被精炼为结构化候选知识。冲突必须向所有成员披露；只有负责人/指定负责人可以持久提交答案。其他人的当轮回复可用于当前回答，但不得回传知识库。
- 系统不保存整段聊天，也不会把 Agent 自己生成的草稿自动当作事实证据。

## 卸载

```bash
codex mcp remove changyi_jiuan_knowledge
launchctl unsetenv CYJ_MCP_BEARER_TOKEN
```

Qoder 可从 MCP 设置删除 `changyi_jiuan_knowledge`；Hermes 使用 `hermes mcp remove changyi_jiuan_knowledge`。删除本机 Skill 目录不会删除服务器数据。
