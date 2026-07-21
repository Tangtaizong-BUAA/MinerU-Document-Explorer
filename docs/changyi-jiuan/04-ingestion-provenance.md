# 04 摄取与来源治理

## 1. 核心原则

“Markdown 化”是建立可检索、可维护的派生表示，不是把所有原文件不可逆地变成文本。原件和派生结果必须并存。

每次摄取都要回答：

1. 文件从哪里来；
2. 导入的准确内容是什么；
3. 用什么解析器和参数转换；
4. 哪些内容成功、失败或可能失真；
5. Markdown 中的段落、表格和图片怎样回到原文件；
6. 源文件变化后哪些知识需要重新检查。

## 2. 目录建议

知识数据目录与应用源码目录逻辑分离。最终物理位置在实施阶段确认，建议形态：

```text
knowledge-data/
├── registry/                    # 领域记录
├── sources/
│   ├── originals/              # 不可变原件
│   └── manifests/              # 文件清单与作业清单
├── normalized/
│   └── <artifact-id>/
│       ├── document.md
│       ├── assets/
│       ├── tables/
│       └── parse-report.json
├── knowledge/                   # 证据、主张、决策、成果
├── memory/
│   ├── inbox/
│   ├── accepted/
│   ├── quarantined/
│   ├── rejected/
│   └── superseded/
└── views/                       # 自动生成视图
```

应用仓库可以保存 Schema、模板和测试样本；真实敏感语料默认不直接提交到公开 fork。

## 3. 文件 Manifest

每个原始文件至少记录：

```yaml
artifact_id: artifact:cyj:01JZ...
original_relative_path: sources/originals/2026/report.pdf
filename: report.pdf
mime_type: application/pdf
size_bytes: 1234567
sha256: "..."
source_kind: user_upload
source_actor: person:cyj:owner
acquired_at: 2026-07-21T00:00:00Z
confidentiality: internal
rights: project-internal
ingest_status: registered
```

Manifest 文件本身需要版本化。绝对路径、密钥和临时下载 URL 不进入正式记录。

### 3.1 首期安全入口

`CYJ_KB_ROOT/ingestion/source-roots.yaml` 是 Agent 可调用摄取入口的唯一根目录配置。项目管理员可通过 `kb_configure_source_root` 写入该配置；每个 `relative_path` 必须相对 `CYJ_KB_ROOT`，且不能等于项目根本身。调用方不能传入文件系统路径，也不能通过符号链接跳出该根目录。

```yaml
source_roots:
  - id: historical-materials
    project_id: project:cyj:main
    relative_path: incoming
```

当前实现的 `kb_ingest` 支持本地只读 `inventory` 和基于 SHA-256 的 `ingest` 登记。登记后，`project-admin` 可用 `kb_parse_artifact` 将单个已登记的 PDF、图片、Word、PPT 或表格交给 MinerU API：凭据只从 `MINERU_API_KEY` 或受控 QMD 配置读取，不接受 MCP 请求传入；每次外发均写入审计，原件不会被改写。未登记、不受支持、未配置凭据或解析失败都会明确返回失败，不能静默改走其他云服务。

## 4. 摄取状态机

```text
discovered
  → registered
  → queued
  → parsing
  → parsed
  → validating
  → quarantined | accepted
  → indexed

任何阶段都可能 → failed
```

状态说明：

- `discovered`：扫描发现但尚未登记；
- `registered`：已计算哈希并创建 artifact；
- `queued`：等待转换；
- `parsing`：解析作业执行中；
- `parsed`：产物已生成；
- `validating`：检查结构、链接、页码和资源；
- `quarantined`：低质量、敏感或复杂结果未通过自动策略；治理 Agent 将补证、换解析器、缩小范围或标记不可解析；
- `accepted`：规范化结果可进入正式检索；
- `indexed`：相应索引已增量更新；
- `failed`：保留错误类别、日志摘要和重试信息。

## 5. 格式处理策略

| 输入 | 规范化产物 | 特殊要求 |
|---|---|---|
| PDF | Markdown、逐页定位、图片、表格、解析报告 | 扫描件和复杂版式优先 MinerU；保留页码 |
| JPG/PNG 等 | 原图、sidecar Markdown、OCR、说明、EXIF 摘要 | 原图不被文本替代；视觉结论需标注模型/人工来源 |
| DOCX | Markdown、内嵌图片、表格、标题层级 | 保留段落/表格定位和批注状态 |
| PPTX | 按页 Markdown、图片、讲稿、表格 | 保留 slide 编号和视觉布局引用 |
| XLSX | 工作表 CSV/JSON、公式清单、Markdown 摘要 | 不能只输出渲染表格；保留工作表与单元格地址 |
| CSV/TSV | 原文件、数据字典、结构摘要 | 大表不把全部行塞进 Markdown 正文 |
| Markdown | 补全 frontmatter、资源校验 | 不重复生成正文副本 |
| 音频/视频 | 原文件、转写、时间码、关键帧 | 首期预留接口，解析器另选 |

## 6. MinerU 适配策略

优先级由部署模式决定：

1. 本地 MinerU：敏感资料和离线场景；
2. MinerU Cloud：仅在数据外发策略已显式启用且资料分类允许时；
3. PyMuPDF 等基础后端：文本型 PDF 快速路径或降级；
4. Agent 修复路径：解析失败、特殊表格、手写内容和关键图示进入隔离队列，由多解析器、视觉模型或结构化规则补救。

每个解析结果必须记录：

- parser 名称和版本；
- 模型或后端；
- 参数、语言和页码范围；
- 开始/结束时间；
- 输入 SHA-256；
- 输出文件和 SHA-256；
- 警告、失败页和质量分；
- 是否发生云端外发。

## 7. 图片与表格 sidecar

图片 sidecar 示例：

```markdown
---
id: artifact:cyj:image-001
type: artifact
mime_type: image/jpeg
sha256: "..."
source_refs: [artifact:cyj:report-001]
locator: "page:12, figure:2"
validation_status: unverified
---

# 图 2：设备布置

原图资源：`kb://artifact/artifact%3Acyj%3Aimage-001`

## OCR

……

## 描述

由解析模型生成，尚未通过证据质量策略。

## 关联

- supports [[claim:cyj:deployment-layout-001]]
```

复杂表格同时保留：

- 原图或源工作表；
- 机器可读 CSV/JSON；
- Markdown 中的摘要和字段解释；
- 原页码、工作表和单元格定位。

## 8. 幂等与增量

- 同一 `sha256 + parser_version + parameters_hash` 不重复解析；
- 文件移动只更新路径映射，不生成新 artifact；
- 同一业务文件内容变化时创建新版本，不覆盖旧哈希；
- 只重新索引变化的规范化文件和受影响关系；
- 解析器升级不强制全库立即重算，进入可控迁移队列；
- 重试保留同一 job ID 的 attempt 历史。

## 9. 质量检查

自动检查：

- 输出文件存在且非空；
- Markdown 标题和代码块闭合；
- 相对资源链接可解析；
- 页数/幻灯片数/工作表数与源文件基本一致；
- 表格和图片引用有实际 asset；
- 无绝对临时路径、密钥和签名 URL；
- 字符异常、重复页、空白页和 OCR 低置信度；
- manifest、parse report 和 artifact 记录一致。

治理 Agent 优先处理队列：

- 形成正式结论所依赖的关键证据；
- 人物身份、联系方式和敏感内容；
- 手写、模糊扫描、复杂公式和合并单元格；
- 模型生成的图片描述；
- 公开发布前的引用和版权信息。

治理 Agent 不能仅凭第二次语言模型自评把结果设为 accepted；必须增加可机读证据，例如交叉解析一致性、源位置回读、结构计数、规则校验或独立模型一致性，并保存 validation event。

## 10. 失败与恢复

- 解析失败不能影响原文件登记和后续重试；
- 作业日志只保留必要摘要，完整调试日志按保留策略清理；
- 失败项进入可查询队列，不能被“扫描完成”掩盖；
- 删除派生内容后可根据 manifest 重新生成；
- 源文件缺失或哈希变化立即将相关证据标为 `stale`，禁止继续作为已验证依据。

## 11. 备份边界

至少分别备份：

1. 原始文件和 manifest；
2. 规范化 Markdown、assets 和领域记录；
3. Git 仓库与 Schema；
4. 审计日志、策略版本和 validation event。

SQLite 索引可以备份以加快恢复，但恢复验收必须包含“从文件全量重建成功”。
