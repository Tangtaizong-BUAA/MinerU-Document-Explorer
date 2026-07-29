# 长翼久安知识库mcp工具

这个文件夹可直接分享给团队成员。它包含 MCP 声明、Agent Skill、安装脚本和可交给 Codex 的安装提示词。

不包含访问令牌、项目原件或任何本地数据库。

## 团队成员安装

1. 从项目管理员处通过安全渠道取得团队 MCP 访问令牌；不要把令牌写进聊天、Git、共享文件夹或截图。
2. 将本文件夹复制到本机任意位置。
3. 在终端运行：

```bash
cd /path/to/changyi-jiuan-knowledge
bash scripts/install-mcp.sh
```

脚本会静默要求输入令牌，将内置 Skill 安装到 `${CODEX_HOME:-~/.codex}/skills/changyi-jiuan-knowledge-operations`，把 `changyi_jiuan_knowledge` 注册为全局 Codex MCP，并设置当前 macOS 登录会话所需的环境变量。

4. 重启 Codex App，打开一个新任务。Agent 会先调用 `kb_brief` 完整读取主文件和分文件导航；按需用 `kb_graph_context` 读取分文件及其 artifacts，并对具体细节主动执行 `kb_search` RAG。在项目工作中，它会用 `kb_update_main`/`kb_upsert_section` 维护长期认知、用 `kb_publish_resource` 自动归档产物，并用 `kb_capture_context` 提炼对话中的长期信息。

也可以直接把 [PROMPT-FOR-CODEX.md](PROMPT-FOR-CODEX.md) 连同本文件夹交给 Codex。

## 访问与安全

- 服务地址固定为 `https://argonai.cn/cyj/mcp`，使用 Bearer Token 验证。
- 当前团队令牌对应项目管理能力；只应发给获授权的内部成员。
- 插件不会把令牌写入此文件夹或 Git。`install-mcp.sh` 仅把令牌注入当前 macOS 登录会话；重新登录 macOS 后需再运行一次脚本。
- Agent 不得把令牌放进 MCP 调用、知识库记录、提交信息或输出内容。

## 图片上下文

检索默认返回最小必要的文本证据。若 MinerU 输出的 Markdown 含有图片引用，`kb_search` 会附带紧凑 `visual_context`：页/幻灯片、章节、图片替代文字或说明、KB 资源 URI；不会默认传输图片字节。

现有首批导入资料尚无 MinerU 图片引用，因此不会立即返回图片上下文。要补齐旧资料的图文关联，需要以包含图片资产的 MinerU 输出重新解析并导入。

## 自动维护闭环

- 每个长翼久安相关任务先创建 `work_id`。
- 主文件长期保存项目总认知和导航；分文件长期保存科研、实践、联络、竞赛等专题信息。两者都由 Agent 通过 revision 控制持续维护。
- Agent 从主文件选择分文件；读取分文件时，服务器同步回传图谱链接的 artifact 摘录与图片上下文。具体人名、数据、版本和原文必须继续走 RAG 和证据精读。
- Agent 生成的 Markdown、报告、方案、表格、代码、图片或文档通过 MCP 上传到服务器；小型文本立即进入搜索，二进制文档可继续交给 MinerU 解析。
- 对话中形成的事实、决策、约束、偏好、经验和开放问题会被精炼为结构化候选知识。服务器依据证据、用户指令和冲突策略自动接受、隔离或拒绝。
- 系统不保存整段聊天，也不会把 Agent 自己生成的草稿自动当作事实证据。

## 卸载

```bash
codex mcp remove changyi_jiuan_knowledge
launchctl unsetenv CYJ_MCP_BEARER_TOKEN
```
