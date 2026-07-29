---
name: changyi-jiuan-knowledge-operations
description: Use the Changyi Jiuan project knowledge MCP for evidence-grounded retrieval, project work, MinerU normalization, and durable knowledge closeout.
---

# 长翼久安知识库操作

将 MCP 服务视为项目知识的唯一持久化来源。不要在聊天、本地笔记或任意数据库中维护第二份项目事实。

## 默认工作流

1. 始终先用 `kb_brief` 完整读取 Agent 长期维护的主文件与分文件导航；不要用一次全库 RAG 代替主文件。
2. 从主文件选择相关分文件，用 `kb_graph_context` 同步读取分文件、图谱邻居和链接的 artifacts，默认深度为 1。
3. 对人名、数字、日期、版本、原文表述、证据和其他可核验细节，必须主动运行 `kb_search` 做 RAG。主文件和分文件只负责认知与综合，不能单独支撑细节结论。把原问题传给 `kb_graph_context`，必要时再用 `kb_outline`、`kb_read` 精读命中页。
4. 输出中标明证据 ID 与不确定性。不得把 stale、disputed、quarantined 或无证据的内容当成已确认事实。
5. 会改变交付物或知识的工作，先 `kb_start_work`。
6. 工作中持续维护层级：稳定的全局认知与路由用 `kb_update_main`；专题细节和 artifact 链接用 `kb_upsert_section`。更新时必须携带当前 revision，避免覆盖并发修改。
7. Agent 每生成一个需要长期保留的项目资源，立即用 `kb_publish_resource` 上传；少量最终产物也可通过 `kb_finish_work.generated_resources` 一并提交。
8. 对话中形成明确事实、用户决策、约束、偏好、经验或待解决问题时，用 `kb_capture_context` 提交精炼陈述与证据引用，不上传原始聊天记录。作用域必须具体，避免不同事实互相冲突。
9. 结束时无论成功、部分完成或失败，都用 `kb_finish_work` 提交资源、证据、未解决项和剩余 `knowledge_updates`。

## 最小工具选择

- 完整项目主文件和分文件导航：`kb_brief`
- 一个分文件及其链接 artifacts：`kb_graph_context`
- 精确状态、负责人、日期、类型：`kb_lookup`
- 主题、关键词、历史结论和事实细节：`kb_search` 后接 `kb_graph_context` 或 `kb_read`
- 文档结构：`kb_outline`
- 交付物、风险、时间线等结构视图：`kb_view`
- 持久化 Agent 产物：`kb_publish_resource`
- 提炼对话中的长期知识：`kb_capture_context`
- 维护项目主文件：`kb_update_main`
- 创建或更新长期分文件：`kb_upsert_section`

若搜索返回 `visual_context`，它只是与命中文本关联的紧凑图片元信息。仅在需要时读取其中的 KB 资源 URI；不要臆测图片内容，也不要把 URI 当作服务器文件路径。

主文件要稳定、简洁、可导航；详细内容放入分文件，分文件显式链接能验证或深化内容的 artifacts。不要把 artifact 正文复制进主文件，也不要用主/分文件替代细节 RAG。

## 导入与维护

仅在拥有项目管理权限时使用 `kb_configure_source_root`、`kb_ingest`、`kb_parse_artifact` 与 `kb_maintain`。原始文件必须保留；MinerU 解析结果和 Agent 自己生成的资源都是可追溯材料，但不自动等同于已验证事实。

不得在 MCP 调用、知识记录、提交信息或输出中放置访问令牌。
