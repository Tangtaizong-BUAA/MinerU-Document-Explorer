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

脚本会静默要求输入令牌，将 `changyi_jiuan_knowledge` 注册为全局 Codex MCP，并设置当前 macOS 登录会话所需的环境变量。

4. 重启 Codex App，打开一个新任务。先让 Agent 调用 `kb_brief`，随后可用 `kb_search`、`kb_read`、`kb_outline` 与 `kb_view`。

也可以直接把 [PROMPT-FOR-CODEX.md](PROMPT-FOR-CODEX.md) 连同本文件夹交给 Codex。

## 访问与安全

- 服务地址固定为 `https://argonai.cn/cyj/mcp`，使用 Bearer Token 验证。
- 当前团队令牌对应项目管理能力；只应发给获授权的内部成员。
- 插件不会把令牌写入此文件夹或 Git。`install-mcp.sh` 仅把令牌注入当前 macOS 登录会话；重新登录 macOS 后需再运行一次脚本。
- Agent 不得把令牌放进 MCP 调用、知识库记录、提交信息或输出内容。

## 图片上下文

检索默认返回最小必要的文本证据。若 MinerU 输出的 Markdown 含有图片引用，`kb_search` 会附带紧凑 `visual_context`：页/幻灯片、章节、图片替代文字或说明、KB 资源 URI；不会默认传输图片字节。

现有首批导入资料尚无 MinerU 图片引用，因此不会立即返回图片上下文。要补齐旧资料的图文关联，需要以包含图片资产的 MinerU 输出重新解析并导入。

## 卸载

```bash
codex mcp remove changyi_jiuan_knowledge
launchctl unsetenv CYJ_MCP_BEARER_TOKEN
```
