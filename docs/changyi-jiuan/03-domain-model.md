# 03 领域模型

## 1. 建模目标

领域模型必须同时支持科研和社会实践，但不能把二者简单塞进同一个“文档标签”。统一的核心链路是：

```text
项目目标
  → 工作流
  → 工作项/活动
  → 原始资料
  → 证据
  → 主张/发现
  → 决策
  → 成果
  → 可复用记忆
```

科研中的实验、数据和结论，与社会实践中的访谈、观察和活动记录，都通过“活动—资料—证据—主张”链路表达；各自的专有字段保留在具体类型中。

## 2. 共同字段

所有正式记录必须包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 稳定 ID，创建后不因改名或移动而改变 |
| `type` | enum | 记录类型 |
| `title` | string | 人类可读标题 |
| `status` | enum | 生命周期状态 |
| `project_id` | ID | 所属项目；首期仍显式保存 |
| `created_at` | datetime | 记录创建时间 |
| `updated_at` | datetime | 最后实质更新 |
| `created_by` | actor | 人、Agent 或导入作业 |
| `source_refs` | ID[] | 来源或证据引用 |
| `tags` | string[] | 辅助检索标签，不替代正式关系 |
| `confidentiality` | enum | `public/internal/restricted/secret` |
| `schema_version` | integer | 记录遵循的 Schema 版本 |

派生记录还必须包含：

- `derivation`: `human/agent/parser/import`；
- `confidence`: 0～1，仅表示该记录自身的可信度；
- `validation_status`: `unverified/verified/quarantined/rejected`；
- `supersedes`: 被本记录取代的记录 ID，可为空。

## 3. 稳定 ID 规则

格式：`<type>:<project-key>:<ulid-or-slug>`。

示例：

```text
project:cyj:main
activity:cyj:2026-summer-fieldwork-01
artifact:cyj:01JZ7T2A8R6Y...
evidence:cyj:01JZ7T52KFW...
claim:cyj:maintenance-cost-001
decision:cyj:retrieval-profile-001
```

规则：

- ID 不使用可变的绝对路径；
- 人工或 Agent 明确维护的稳定概念可以使用可读 slug；
- 高频、批量和来源派生记录使用 ULID；
- 内容哈希作为版本与判重依据，但不直接替代业务 ID；
- ID 重定向和 `supersedes` 显式保留，不复用旧 ID 表达新事实。

## 4. 核心记录类型

### 4.1 `project`

维护项目总体信息：

- 名称、简称、使命；
- 起止日期与当前阶段；
- 总负责人和核心成员；
- 科研目标、实践目标和共同成果目标；
- 当前状态、健康度和主要风险；
- 里程碑、验收标准和最终成果；
- 当前正式简报版本。

`project` 记录的 Markdown 正文就是 Agent 长期维护的主文件；`main_revision` 防止并发覆盖，`section_refs` 是进入分文件的正式导航。主文件在每个 Agent 任务开始时完整加载，但只保存稳定的项目总认知和路由，不复制 artifact 细节。

首期只有一个主项目，但保留 `project_id` 可避免记录脱离上下文。

### 4.1.1 `knowledge_section`

表示 Agent 长期维护的项目分文件：

- 稳定 `key`、标题、摘要和完整 Markdown；
- `parent_ref` 指向主项目或另一个分文件；
- `child_section_refs` 表示更细的专题层级；
- `artifact_refs` 指向能验证或深化本专题的原始/生成资源；
- `related_refs` 链接工作流、成果、决策等领域记录；
- `revision_hash`、旧版本与变更工作项保证可回退和并发安全。

典型分文件包括科研与长城保护、社会实践与地方协同、申报竞赛与答辩、对外联络等。Agent 先由主文件选择分文件，再由图谱同步读取其 artifacts；具体事实仍应通过 RAG 和证据精读复核。

### 4.2 `workstream`

建议初始工作流：

- `research`：科研问题、实验、分析、论文；
- `social-practice`：走访、访谈、观察、活动；
- `communication`：宣传、影像、公开材料；
- `operations`：人员、计划、会议、预算、风险；
- `knowledge-system`：本知识库自身建设和维护。

工作流可调整，但禁止以任意标签替代明确归属。

### 4.3 `work_item`

Agent 和人执行工作的统一任务单：

- 目标与预期输出；
- 所属工作流、负责人和协作者；
- 输入资料和依赖；
- 开始、截止和完成时间；
- `planned/in_progress/awaiting_closeout/blocked/completed/cancelled` 状态；
- 验收标准；
- closeout 和成果引用。

### 4.4 `activity`

统一表示实验、会议、访谈、走访、活动、采样和发布：

- `kind`: `experiment/interview/meeting/field_visit/observation/event/survey/publication/other`；
- 时间、地点、参与人员；
- 方案或议程；
- 输入和产出资料；
- 伦理、授权或知情同意状态；
- 结果摘要和遗留问题。

### 4.5 `person`、`organization`、`location`

用于工作关系、参与者、合作单位和实践地点：

- 正式名称、别名和角色；
- 联系方式默认不进入未获相应 capability 的 Agent 检索摘要；
- 与活动、工作流和成果建立显式关系；
- 对个人评价必须区分事实、观察和推断；
- 敏感身份和联系方式遵循最小可见原则。

### 4.6 `artifact`

表示原始或生成的文件对象：

- 原始相对路径、MIME、大小、SHA-256；
- 来源、获取时间和权利信息；
- 当前版本和历史版本；
- 规范化 Markdown 路径；
- 解析器、版本、参数和质量；
- 关联活动、任务和成果；
- 保密级别和可外发范围。

### 4.7 `evidence`

表示可精确定位的证据单元：

- 所属 `artifact_id`；
- 定位器：页码、行号、章节、表格、图片、单元格、时间码；
- 尽量短的证据摘录或结构化内容；
- 观察时间和记录主体；
- 复核状态；
- 支持或反驳的 `claim_id`；
- 内容指纹，防止源文件变化后定位失效。

### 4.8 `claim`

表示研究发现、实践观察或项目事实主张：

- 主张文本；
- `fact/observation/inference/hypothesis/recommendation` 类型；
- `proposed/supported/disputed/rejected/superseded` 状态；
- 支持证据与反证；
- 置信度和适用范围；
- 有效时间；
- validation event 与策略版本。

回答时不得把 `hypothesis` 或 `inference` 伪装成已验证事实。

### 4.9 `decision`

表示正式决定：

- 决策问题；
- 选择结果；
- 候选方案和取舍；
- 依据的证据、主张和约束；
- 决策人、时间和适用范围；
- `proposed/accepted/rejected/superseded`；
- 复审日期和被取代关系。

### 4.10 `deliverable`

表示论文、报告、数据集、软件、视频、展板等成果：

- 成果类型和版本；
- 对应目标和工作项；
- 组成 artifact；
- 评审、发布和验收状态；
- 对外地址与可见范围；
- 复现或生成说明。

### 4.11 `risk` 与 `issue`

- `risk`：尚未发生但可能影响项目的风险；
- `issue`：已经发生的问题或阻塞；
- 包含概率、影响、等级、负责人、缓解措施和当前状态；
- 关闭时必须记录实际结果，而不是简单删除。

### 4.12 `memory`

只保存值得跨任务复用的信息：

- `fact`：稳定事实；
- `decision`：已接受决定；
- `procedure`：经过验证的操作方法；
- `lesson`：有证据的成功或失败经验；
- `constraint`：持续约束；
- `preference`：来自可认证用户指令，或经长期证据策略验证的稳定偏好；
- `open_question`：需要后续追踪的问题。

完整聊天、临时草稿和未经验证的推测不直接成为正式记忆。

### 4.13 `validation_event`

表示策略引擎对 artifact、evidence、claim、decision 或 memory 的一次不可变裁决：

- 被校验对象和输入内容哈希；
- policy ID、版本和规则集合哈希；
- `accepted/quarantined/rejected/disputed/superseded` 决定；
- 机器可读 reason codes；
- 使用的 evidence/source 引用；
- 执行 Agent、MCP session、trace ID 和时间；
- 若隔离，关联 remediation work ID。

validation event 只追加不覆盖。重新校验生成新事件，当前状态由最新有效事件投影。

## 5. 关键关系

| 关系 | 起点 → 终点 | 说明 |
|---|---|---|
| `part_of` | 任意记录 → project/workstream | 归属 |
| `performed_by` | activity/work_item → person/organization | 执行主体 |
| `occurred_at` | activity → location | 发生地点 |
| `produced` | activity/work_item → artifact/deliverable | 产出 |
| `derived_from` | artifact/evidence/memory → source | 派生关系 |
| `supports` | evidence → claim | 支持主张 |
| `contradicts` | evidence → claim | 反驳主张 |
| `motivates` | claim/risk → decision | 促成决定 |
| `implements` | work_item/deliverable → decision | 落实决定 |
| `supersedes` | claim/decision/memory → 同类型记录 | 取代但保留历史 |
| `blocks` | issue/work_item → work_item/milestone | 阻塞 |
| `validates` | validation_event → artifact/evidence/claim/decision/memory | 自动策略裁决 |

关系必须指向 ID。人类可读标题和 `[[wikilink]]` 是展示层，不是唯一引用键。

## 6. 存储形态

### 6.1 领域记录

每条正式记录是一份 Markdown 文件，YAML frontmatter 保存结构化字段，正文保存叙述、证据说明和关系。

### 6.2 总体信息表

总体信息表是从领域记录生成的视图，不直接成为第二套真相源：

- 项目总览；
- 人员与组织索引；
- 项目与经历时间线；
- 活动与实验台账；
- 证据—主张矩阵；
- 决策日志；
- 成果清单；
- 风险与问题看板；
- 记忆隔离、冲突与自动补证队列。

### 6.3 SQLite 物化

为高效筛选，frontmatter 字段可物化为 SQLite 表；文件更新后增量同步。物化表发生冲突时，以通过 Schema 校验的文件为准。

## 7. 数据质量规则

- `claim: supported` 至少有一个有效 evidence；
- `decision: accepted` 必须有决策主体和依据；
- `work_item: completed` 必须有 closeout 或成果引用；
- `artifact` 必须有哈希和来源状态；
- `evidence` 必须有精确定位器；
- `memory: accepted` 必须有 evidence 和 validation event；
- validation event 必须包含 policy 版本、输入哈希、reason codes 和 trace ID；
- `superseded` 记录必须指向替代记录；
- 关系目标不存在时报告 broken link，不自动造事实；
- 保密级别不能因派生或摘要而自动降低。

机器可读历史草案见 [specs/domain-model.v0.1.yaml](specs/domain-model.v0.1.yaml)。

## 8. 0.5 领域模型增量

0.5 保留上述基础记录，新增以下机器可验证对象：

- **`evidence_unit`**：统一表达文字、图片、表格、音频转写、原生视频片段和视频关键帧，必须绑定 Artifact 哈希、modality-specific locator、内容指纹与 `native_video_understood` 标志；
- **`conflict`**：一等 canonical 记录，状态为 `open/resolution_pending/resolved`，保存多种主张、证据、领域、影响和用户问题；
- **`user_conflict_resolution`**：锁定用户回答、原话哈希、来源任务、期望 conflict revision、提交 principal 和 attestation mode；共享 token 只能记为 `client_attested/team-principal`，原话哈希不证明人类作者身份；
- **`typed_conflict_resolution`**：表达单方取代、双方按 scope 同时成立、双方否定、候选拒绝或继续开放，不能把所有答案强制映射为 superseded；
- **`maintenance_change_packet` / `maintenance_plan`**：把变化证据与模型提出的结构化整理计划分开，模型输出没有提交副作用；
- **`revision_manifest` / `knowledge_snapshot`**：不可变 revision 目录、单 current pointer 和请求级固定 snapshot 的发布契约；
- **`model_configuration`**：把供应商、地域、Workspace endpoint、API dialect、模型 ID 和 credential reference 作为一个版本化配置 tuple。

`knowledge_section` 增加 `conflict_refs`，但 ConflictRecord、冲突状态、`conflict_refs` 和冲突派生视图均为 Harness 保护字段。通用文档/拓扑补丁不能修改、删除、隐藏或断开它们；只有 ConflictService 能登记新 `open` 冲突、追加受约束 evidence observation、锁定用户答案或提交 typed resolution。补证必须绑定目标 claim variant 并验证证据存在、同项目、指纹和密级，只能增加 evidence/source 并更新 `last_seen_revision`；resolved 冲突遇到反证时新建引用旧 resolution 的 open 冲突。用户答案通过 `lock_user_resolution` 进入 pending，再由 `apply_typed_resolution` 与文档/拓扑同事务置 resolved 或退回 open；历史永久保留。

0.5 的完整机器可读目标见 [specs/domain-model.v0.5.yaml](specs/domain-model.v0.5.yaml)。在迁移、Schema 测试和 revision 恢复测试通过前，运行时仍使用 0.4 数据契约。
