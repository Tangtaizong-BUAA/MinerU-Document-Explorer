---
name: changyi-jiuan-knowledge-operations
description: Use the Changyi Jiuan project knowledge MCP for evidence-grounded retrieval, project work, MinerU normalization, and durable knowledge closeout.
---

# 长翼久安知识库操作

将 MCP 服务视为项目知识的唯一持久化来源。不要在聊天、本地笔记或任意数据库中维护第二份项目事实。

## 默认工作流

1. 先用 `kb_brief` 读取项目总体信息。
2. 已知精确字段时用 `kb_lookup`；问题涉及主题、表述或未知资料时用 `kb_search`。
3. 只读取搜索结果返回的 `kb://` 资源。大文档先 `kb_outline`，再 `kb_read` 必要部分。
4. 输出中标明证据 ID 与不确定性。不得把 stale、disputed、quarantined 或无证据的内容当成已确认事实。
5. 会改变交付物或结论的工作，先 `kb_start_work`；结束时无论成功、部分完成或失败，都用 `kb_finish_work` 提交证据、未解决项和受支持的结论。

## 最小工具选择

- 项目总体状态：`kb_brief`
- 精确状态、负责人、日期、类型：`kb_lookup`
- 主题、关键词、历史结论：`kb_search` 后接 `kb_read`
- 文档结构：`kb_outline`
- 交付物、风险、时间线等结构视图：`kb_view`

若搜索返回 `visual_context`，它只是与命中文本关联的紧凑图片元信息。仅在需要时读取其中的 KB 资源 URI；不要臆测图片内容，也不要把 URI 当作服务器文件路径。

## 导入与维护

仅在拥有项目管理权限时使用 `kb_configure_source_root`、`kb_ingest`、`kb_parse_artifact` 与 `kb_maintain`。原始文件必须保留；MinerU 解析结果是可追溯材料，不自动等同于已验证事实。

不得在 MCP 调用、知识记录、提交信息或输出中放置访问令牌。
