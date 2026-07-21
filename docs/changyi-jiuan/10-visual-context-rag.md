# 10 视觉上下文 RAG

## 1. 目标

`kb_search` 命中文档带有图片引用时，为每个命中附带上最小的视觉上下文元数据，使 Agent 能在不额外请求全文的前提下判断图片是否与当前问题相关。

核心设计约束：

- **不返回图片字节** — 视觉上下文纯为文本元数据（alt text、标题、页码/幻灯片、节标题、`kb://` 资源 URI）；
- **不构造独立图库** — 图片关联信息内嵌于 artifact 记录 frontmatter，是规范化资料的自然衍生；
- **无图片文档行为不变** — `image_associations` 为空或缺失时，`kb_search` 返回与之前完全一致；
- **不编造图片或事实** — 所有图片关联来自解析器产出的规范化 Markdown 中的 `![alt](url)` 引用；
- **不暴露文件系统路径** — 资源 URI 一律为 `kb://artifact/<id>/image/<n>` 形式。

## 2. 数据模型

### 2.1 ImageAssociation

```typescript
type ImageAssociation = {
  alt_text?: string;
  caption?: string;
  page?: number;
  slide?: number;
  section?: string;
  resource_uri: string;  // kb://artifact/<id>/image/<n>
};
```

### 2.2 存储位置

图片关联存储于 artifact 记录 frontmatter 的 `image_associations` 字段中：

```yaml
---
id: artifact:cyj:01JZ...
type: artifact
title: report.pdf
image_associations:
  - alt_text: "架构总览"
    caption: "图 3：系统架构"
    page: 3
    section: "架构设计"
    resource_uri: "kb://artifact/artifact%3Acyj%3A.../image/0"
  - alt_text: "数据流"
    page: 5
    section: "数据管道"
    resource_uri: "kb://artifact/artifact%3Acyj%3A.../image/1"
---
```

## 3. 提取时机

### 3.1 源 Markdown 导入

`text/markdown` 格式的文件在 `kb_ingest` 时自动扫描 `![alt](url)`引用，提取：

- **alt_text**：`![]` 内的替代文本；
- **caption**：图片上方紧邻的非标题行；
- **page**：最近的 `## Page N` 标题所标注的页码；
- **slide**：最近的 `## Slide N` 标题所标注的幻灯片编号；
- **section**：图片之前的最近标题文本；
- **resource_uri**：稳定的 `kb://artifact/<id>/image/<n>` 句柄。

### 3.2 MinerU API 解析

`kb_parse_artifact` 完成后，同样对 MinerU 产出的规范化 Markdown 执行图片提取。

### 3.3 无图片文件

不含任何 `![alt](url)` 语法的文件产生空的 `image_associations: []`。搜索行为与之前完全一致。

## 4. 检索增强

### 4.1 `kb_search` 文本输出

当命中文档包含图片关联时，在文本摘要中额外追加一行：

```text
artifact:cyj:abc123 [2] Architecture Report
The production cluster uses Kubernetes...

[visual: K8s Cluster Topology, Data Flow Diagram]
```

### 4.2 `kb_search` 结构化输出

`visual_context` 字段附加在每条结果中（仅当有图片时出现）：

```json
{
  "results": [{
    "id": "artifact:cyj:abc123",
    "title": "Architecture Report",
    "score": 2,
    "snippet": "The production cluster uses Kubernetes...",
    "visual_context": [
      {
        "alt_text": "K8s Cluster Topology",
        "page": 1,
        "section": "Page 1",
        "resource_uri": "kb://artifact/artifact%3Acyj%3A.../image/0"
      }
    ]
  }]
}
```

每条结果最多附 5 条图片关联。`visual_context` 缺失时上游客端行为不变。

### 4.3 `kb_read` 图片元数据

Agent 可通过 `kb_read` 按 `kb://artifact/<id>/image/<n>` 读取单张图片的结构化元数据（不返回图片字节）：

```
> kb_read kb://artifact/artifact%3Acyj%3A.../image/0
```

返回：

```yaml
resource_uri: kb://artifact/artifact%3Acyj%3A.../image/0
alt_text: K8s Cluster Topology
page: 1
section: Page 1
```

## 5. 安全与保密

- 图片资源 URI 始终使用 `kb://` 间接引用，绝不暴露文件系统路径；
- `kb_read` 对图片资源只返回元数据，不输出原始图片字节；
- 保密性检查沿用现有 Profile 机制：artifact 所属保密等级超出调用方权限时，整条记录（包括 image_associations）不会出现在搜索结果中；
- 图片关联不包含 EXIF 数据、文件路径、签名 URL 或云端临时地址。

## 6. 已知限制

1. **无逐段匹配** — 当前 `kb_search` 使用词法搜索，只知道文档级别的命中，不知道命中文档内的具体段落/页面。因此视觉上下文返回的是文档级图片集合（最多 5 张），而非仅命中段落的相邻图片。未来引入精确段落定位后可进一步精简。
2. **代码块内误匹配** — 提取器不跟踪 Markdown 代码块边界。用 ` ``` ` 包围的 `![alt](url)` 语法仍会被当作图片引用提取。这在实际文档中极少见，且不会产生安全或准确性损害。
3. **仅 Markdown 图片语法** — 仅匹配 `![alt](url)` 格式。HTML `<img>` 标签、Obsidian 风格 `![[embed]]` 和 CSS 背景图片不会触发提取。MinerU 产出的规范化 Markdown 全部使用标准 Markdown 图片语法，此限制影响极小。
4. **图片数量硬上限** — 每条搜索结果最多附带 5 条图片关联。对于包含大量图片的文档，此限制保证 token 预算受控。
5. **不跟踪图片是否存在** — 提取器只记录 Markdown 中出现的图片引用，不验证引用的图片文件是否实际存在于磁盘或对象存储中。

## 7. Agent 行为建议

Agent 在收到带有 `visual_context` 的搜索结果后：

1. 根据 `alt_text`、`caption`、`section` 字段判断图片是否与当前问题相关；
2. 如需要更多上下文，用 `kb_read` 读取同一 artifact 的相关页面；
3. 如需确认图片内容，用 `kb_read` 读取图片元数据和同页文本；
4. `visual_context` 中的资源 URI 仅作引用句柄，不能直接下载图片文件。
