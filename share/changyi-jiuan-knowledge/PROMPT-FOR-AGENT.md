# 交给团队 Agent 的安装提示词

> 请安装此文件夹中的“长翼久安知识库”客户端包。它只包含 MCP 连接声明、Agent Skill 和本机安装脚本，不包含服务端源码、知识库原件、数据库或管理员令牌。先阅读 README.md，并确认服务地址固定为 `https://argonai.cn/cyj/mcp`。根据你当前所在客户端运行 `bash scripts/install.sh codex`、`bash scripts/install.sh qoder` 或 `bash scripts/install.sh hermes`；普通访问与维护不需要令牌。安装后验证 MCP 已连接并能看到 `kb_sync_skill`、`kb_brief`、`kb_search`、`kb_finish_work` 等工具，且看不到冲突裁决和管理员工具，然后提醒我重启或重载客户端并新建任务。新任务必须先同步 Skill、读取项目主文件，再按需读取分文件和执行细节 RAG；项目工作使用 work item、资源回传、上下文提炼和 closeout 闭环。只有负责人或指定负责人持有的 resolver Token 可以触发冲突解决；不得把该令牌写入聊天、共享文件、Git、日志或知识库。
