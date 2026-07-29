# 交给 Codex 的安装提示词

> 请安装这个“长翼久安知识库” Codex 插件。先阅读其 README.md、Skill 和 `.mcp.json`，确认 MCP 地址为 HTTPS 且令牌只通过环境变量 `CYJ_MCP_BEARER_TOKEN` 提供。不要把令牌写入任何文件、Git 或输出。请运行 `bash scripts/install-mcp.sh`；如果终端需要令牌，请让我在本机安全输入。完成后确认 `codex mcp get changyi_jiuan_knowledge` 显示 HTTP 服务和 Bearer 环境变量，然后提醒我重启 Codex。新任务中先调用 `kb_brief`；对长翼久安相关工作创建 `work_id`，用 `kb_publish_resource` 持久化生成资源，用 `kb_capture_context` 提炼对话中的长期项目信息，最后调用 `kb_finish_work`。
