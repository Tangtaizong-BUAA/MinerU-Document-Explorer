# 交给团队 Agent 的安装提示词

> 请安装此文件夹中的“长翼久安知识库”客户端包。它只包含 MCP 连接声明、Agent Skill 和本机安装脚本，不包含服务端源码、知识库原件或数据库。先阅读 README.md，并确认服务地址固定为 `https://argonai.cn/cyj/mcp`。根据你当前所在客户端运行 `bash scripts/install.sh codex`、`bash scripts/install.sh qoder` 或 `bash scripts/install.sh hermes`。访问令牌只能由我在本机隐藏输入，或由环境变量 `CYJ_MCP_BEARER_TOKEN` 临时提供；不得把令牌写入聊天、共享文件、Git、日志或知识库。安装后验证 MCP 已连接并能看到 `kb_sync_skill`、`kb_brief`、`kb_search` 等工具，然后提醒我重启或重载客户端并新建任务。新任务必须先同步 Skill、读取项目主文件，再按需读取分文件和执行细节 RAG；项目工作使用 work item、资源回传、上下文提炼和 closeout 闭环。
