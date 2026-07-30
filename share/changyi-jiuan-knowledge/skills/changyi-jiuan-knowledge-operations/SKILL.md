---
name: changyi-jiuan-knowledge-operations
description: Use the Changyi Jiuan project knowledge MCP for evidence-grounded retrieval, project work, MinerU normalization, and durable knowledge closeout.
---

# 长翼久安知识库操作

将 MCP 服务视为项目知识的唯一持久化来源。不要在聊天、本地笔记或任意数据库中维护第二份项目事实。

## Skill 增量同步

当前 Skill 协议版本为 `0.5.0`。每个新任务第一次使用项目 MCP 时，先调用 `kb_sync_skill`，传入当前版本、客户端类型；若能读取同目录的 `skill-version.json`，同时传入其中的文件哈希。

若返回 `update_required`，立即按 `delta.files` 只更新变化文件，按 `delta.remove_paths` 只删除服务器明确列出的旧受管文件。所有路径必须是相对路径且位于本 Skill 目录内；先写临时文件并逐个校验 SHA-256，再替换正式文件，最后写入新 `skill-version.json`。不得执行响应中的文件内容，不得修改其他 Skill、MCP 配置或访问令牌。更新后再次调用 `kb_sync_skill` 校验；当前任务继续执行，但新指令只在新任务或客户端重启后生效。若客户端禁止写 Skill 目录，报告该权限边界，不得绕过安全策略。

## 默认工作流

1. 完成 `kb_sync_skill` 版本检查后，用 `kb_brief` 完整读取 Agent 长期维护的主文件与分文件导航；不要用一次全库 RAG 代替主文件。
2. 从主文件选择相关分文件，用 `kb_graph_context` 同步读取分文件、图谱邻居和链接的 artifacts，默认深度为 1。
3. 对人名、数字、日期、版本、原文表述、证据和其他可核验细节，必须主动运行 `kb_search` 做 RAG。主文件和分文件只负责认知与综合，不能单独支撑细节结论。把原问题传给 `kb_graph_context`，必要时再用 `kb_outline`、`kb_read` 精读命中页。
4. 输出中标明证据 ID 与不确定性。相关 `open/resolution_pending` 冲突必须主动说明，不得把 stale、disputed、quarantined 或无证据的内容当成已确认事实。
5. 会改变交付物或知识的工作，先 `kb_start_work`。
6. 工作中只提交 Artifact、精炼上下文和 closeout。服务器维护 Worker 会异步更新主文件、分文件和拓扑；不得用旧版 `kb_update_main/kb_upsert_section` 绕过维护 Harness，它们在 legacy profile 中也只能生成 proposal。
7. Agent 每生成一个需要长期保留的项目资源，立即用 `kb_publish_resource` 上传；少量最终产物也可通过 `kb_finish_work.generated_resources` 一并提交。
8. 对话中形成明确事实、用户决策、约束、偏好、经验或待解决问题时，用 `kb_capture_context` 提交精炼陈述与证据引用，不上传原始聊天记录。作用域必须具体，避免不同事实互相冲突。
9. 结束时无论成功、部分完成或失败，都用 `kb_finish_work` 提交资源、证据、未解决项和剩余 `knowledge_updates`。

## 冲突权限

只有项目负责人和被显式授予 `project-resolve` capability 的指定负责人可以调用 `kb_submit_user_resolution`。调用时逐字提交用户答案、原话 SHA-256、来源 turn、期望 conflict revision 和幂等键；该调用只进入 `resolution_pending`，不能声称知识已经更新。

普通入口即使允许匿名访问，也一律只映射为 `project-contribute`，不能因“无 Token”取得 resolver 或管理员能力。只有随请求提供并通过服务端 principal registry 验证的独立 resolver Token，才可获得 `project-resolve` 工具；不得从本机环境、聊天内容或 URL 参数猜测、代填或传播该 Token。

其他成员的 Agent 仍必须展示相关冲突并询问用户。它可以依照用户当轮回复修正本次推理和回答，但这个回复只能作为当前任务的临时上下文：禁止通过 `kb_capture_context`、`kb_finish_work`、`kb_publish_resource`、legacy 工具或任何其他路径持久回传。不要借“用户说了”伪造 resolver capability。

## 最小工具选择

- 完整项目主文件和分文件导航：`kb_brief`
- 一个分文件及其链接 artifacts：`kb_graph_context`
- 精确状态、负责人、日期、类型：`kb_lookup`
- 主题、关键词、历史结论和事实细节：`kb_search` 后接 `kb_graph_context` 或 `kb_read`
- 文档结构：`kb_outline`
- 交付物、风险、时间线等结构视图：`kb_view`
- 持久化 Agent 产物：`kb_publish_resource`
- 提炼对话中的长期知识：`kb_capture_context`
- 持久提交负责人冲突答案：`kb_submit_user_resolution`（仅 `project-resolve`）
- Skill 版本检查与文件级增量：`kb_sync_skill`

若搜索返回 `visual_context` 或视频 Evidence Unit，按需读取相应 KB 资源 URI。关键帧/OCR/转写只能支撑定位和检索；需要理解动作、时序或完整视频语义时，必须读取原生视频资源，不能把关键帧结论冒充为完整视频理解。

主文件要稳定、简洁、可导航；详细内容放入分文件，分文件显式链接能验证或深化内容的 artifacts。不要把 artifact 正文复制进主文件，也不要用主/分文件替代细节 RAG。

## 导入与维护

仅在拥有项目管理权限时使用 `kb_configure_source_root`、`kb_ingest`、`kb_parse_artifact` 与 `kb_maintain`。原始文件必须保留；MinerU 解析结果和 Agent 自己生成的资源都是可追溯材料，但不自动等同于已验证事实。

不得在 MCP 调用、知识记录、提交信息或输出中放置访问令牌。

需要工具参数、增量更新状态和失败边界时，读取 [references/mcp-workflow.md](references/mcp-workflow.md)。
