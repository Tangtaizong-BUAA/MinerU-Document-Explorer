# 交给 Codex 的安装提示词

> 请安装这个“长翼久安知识库” Codex 插件。先阅读其 README.md、Skill 和 `.mcp.json`，确认 MCP 地址为 HTTPS 且令牌只通过环境变量 `CYJ_MCP_BEARER_TOKEN` 提供。不要把令牌写入任何文件、Git 或输出。请运行 `bash scripts/install-mcp.sh`；如果终端需要令牌，请让我在本机安全输入。完成后确认 Skill 已安装到 Codex skills 目录，且 `codex mcp get changyi_jiuan_knowledge` 显示 HTTP 服务和 Bearer 环境变量，然后提醒我重启 Codex。新任务中先调用 `kb_brief` 完整读取主文件；从主文件选择分文件并用 `kb_graph_context` 同步读取链接 artifacts；对人名、数字、版本、原文和其他细节主动调用 `kb_search` RAG。项目工作先创建 `work_id`，用 `kb_update_main`/`kb_upsert_section` 维护长期认知，用 `kb_publish_resource` 持久化生成资源，用 `kb_capture_context` 提炼对话知识，最后调用 `kb_finish_work`。
