# 08 验收与评测

> 0.5.0 修订说明：本文件新增多模态分桶、Maintenance Harness、冲突保护、immutable revision pointer 和 Worker 隔离门禁。该发布前约束已执行；0.5.0 于 2026-07-30 在专项回归、阿里 live gate、家庭影子路径和阿里只读回退通过后发布。

## 1. 验收原则

工程契约可先基于合成 fixture、标准问题、可重复命令和保存的结果验收；正式知识库质量必须在未来真实资料接入后重新验收。以下内容不能单独作为完成证据：

- 页面能打开；
- 随机问一个问题答对；
- 单元测试通过但未测试真实文件；
- Agent 自述已经保存记忆；
- 向量数据库中存在记录但无法回到源文件。

## 2. 评测资产

### 2.1 固定样本集

当前先建立可公开提交的合成评测清单；真实资料提供后再建立不进入公开仓库的私有评测清单。两类均包括：

- 文本 PDF、扫描 PDF、DOCX、PPTX、XLSX/CSV、图片；
- 中文为主，保留项目真实术语和别名；
- 简单精确命中、跨文档关联、时间状态、否定和冲突案例；
- 至少一个禁止未授权 Agent 身份读取的受限样本。

0.5 私有 gold set 还必须至少包含：30 个文本问题、20 个图像/页面问题、15 个表格问题、12 个原生视频问题、12 个关键帧/时间码定位问题和 20 个跨模态问题。视频样本必须把受控原视频交给维护模型，并同时评估关键帧/转写检索定位；只处理关键帧的运行不得计入原生视频分桶。原始音频不属于 0.5 强制范围。

### 2.2 Gold 问题

合成首轮 20～30 个；真实资料接入后扩展到 30～50 个，稳定后至少 100 个。每个问题保存：

- 问题与可接受改写；
- 预期 record/artifact/evidence ID；
- 正确页码、章节、行号、单元格或时间码；
- 必须包含和禁止包含的事实；
- 问题类别和难度；
- 是否允许回答“不知道”。

Gold 资产由生成 Agent 建立、独立验证 Agent 从来源定位反查；只有预期答案、来源内容和确定性校验一致时才进入基准。两个语言模型的一致意见本身不算 gold 证据。

## 3. 数据完整性

| 指标 | Phase 1 门槛 | 正式门槛 |
|---|---:|---:|
| 原始文件登记覆盖率 | 100% | 100% |
| 已登记文件 SHA-256 覆盖率 | 100% | 100% |
| 规范化结果可追溯到 artifact | ≥ 95% | 100% |
| 关键证据精确定位覆盖率 | ≥ 90% | ≥ 98% |
| 丢失或静默覆盖原文件 | 0 | 0 |

“关键证据”由版本化 gold set 和领域规则标注；Agent 必须从来源定位反查，不以人工抽检作为正常依赖。

## 4. 解析质量

按格式抽检：

- 标题层级正确率；
- 页码/幻灯片/工作表映射；
- 图片、表格和公式保留率；
- OCR 字符错误和段落顺序；
- 资源链接可用率；
- 敏感字段是否被错误外发或写入公开路径。

关键材料一旦低于可接受质量必须进入 `quarantined` 并自动创建修复任务，不能直接索引为已验证知识。

## 5. 检索指标

| 指标 | Phase 1 目标 | 正式目标 |
|---|---:|---:|
| Top-5 evidence recall | ≥ 0.80 | ≥ 0.90 |
| Top-3 evidence recall | ≥ 0.70 | ≥ 0.85 |
| 精确 ID/标题查询正确率 | ≥ 0.95 | ≥ 0.99 |
| 受限内容越权返回率 | 0 | 0 |
| superseded 内容未标注率 | ≤ 0.05 | 0 |

同时分别报告：

- BM25；
- 向量；
- 混合＋重排；
- 结构化 lookup；
- auto 路由。

不只报告总平均，必须列出失败问题和失败类型。

### 5.1 0.5 多模态分桶门槛

各分桶独立计算，不能用文本高分掩盖视觉或视频失败：

| Gold 分桶 | 最少问题数 | Top-5 Recall | Top-3 Recall | 精确 locator 正确率 |
|---|---:|---:|---:|---:|
| 文本 | 30 | ≥ 0.90 | ≥ 0.85 | ≥ 0.98 |
| 图像/页面 | 20 | ≥ 0.85 | ≥ 0.75 | ≥ 0.95 |
| 表格/单元格 | 15 | ≥ 0.85 | ≥ 0.75 | ≥ 0.95 |
| 原生视频理解 | 12 | ≥ 0.80 | ≥ 0.70 | ≥ 0.90 |
| 视频关键帧/已有转写定位 | 12 | ≥ 0.80 | ≥ 0.70 | ≥ 0.90 |
| 文本→视觉/表格/视频跨模态 | 20 | ≥ 0.80 | ≥ 0.70 | ≥ 0.90 |

补充门槛：

- 每个命中结果返回正确 Artifact ID 和 modality-specific locator；
- 命中的图像资源 URI 可读取率为 100%，越权资源返回率为 0；
- 同一 index version 内向量模型、地域、维度和归一化配置一致率为 100%；
- 分别报告 FTS、vector、fusion、受控 rerank 的结果和 API 成本；
- rerank 关闭时仍需达到正式 Top-5 下限的 95%，避免把召回失败隐藏在付费重排中。

## 6. 回答与引用

评测维度：

- 核心事实是否由返回证据支持；
- 引用是否指向正确文件和位置；
- 是否把推断、假设或 disputed 内容说成事实；
- 多个来源冲突时是否披露；
- 无证据时是否诚实拒答；
- 是否泄漏超出权限的信息。

正式门槛：

- 关键事实引用正确率 ≥ 0.95；
- 无来源编造率 ≤ 0.01；
- 已知不可回答问题的诚实拒答率 ≥ 0.95；
- restricted/secret 越权泄漏为 0。

## 7. Token 与延迟

### Token 指标

- `project-read` 工具描述总量；
- 每次 `kb_brief` 返回量；
- 每次 search 的结果数与摘要 token；
- 从首次查询到足够回答的累计检索 token；
- Agent 是否绕过 outline 读取全文。

正式默认目标：

- `kb_brief` ≤ 800 token；
- `kb_search` 默认正文 ≤ 600 token；
- 单问题检索上下文 P50 ≤ 1200 token；
- 单问题检索上下文 P95 ≤ 2500 token；
- 不因工具报错重复返回整份正文。

### 延迟指标

在目标机器分别测量冷启动与热路径：

- lookup P95；
- BM25 P95；
- hybrid P95；
- outline/read P95；
- MCP server 冷启动与模型加载；
- 增量索引耗时。

具体毫秒门槛在 Phase 1 获取设备基线后确定，避免在无实测前虚构数字。

### 三客户端互操作

Qoder、Hermes Agent、Codex 各自必须完成：

1. 初始化和 capability discovery；
2. `kb_start_work`；
3. brief → lookup/search → outline/read 的最小上下文路径；
4. `kb_finish_work` 幂等重试；
5. 自动记忆裁决和 policy trace 读取；
6. 模拟中断后的恢复与 closeout 门禁；
7. restricted 资源拒绝和提示注入隔离。

三个客户端的 fixture 输出必须在结构语义上等价；客户端私有字段不得进入领域记录。

## 8. 记忆闭环

必须覆盖：

1. 相同 `work_id + result_hash` 重试；
2. 无证据 lesson；
3. 与 accepted 事实冲突；
4. supersede 旧决定；
5. 失败任务提交有效经验；
6. 未授权主体尝试调用治理工具或伪造 policy decision；
7. artifact 哈希已经变化；
8. 候选内容包含密钥模式；
9. candidate/quarantined 默认搜索不可见；
10. as-of 时间查询返回历史有效状态。

正式门槛：

- 幂等重复写入数为 0；
- 未通过对应策略门禁的解释性记忆进入 accepted 数为 0；
- 冲突静默覆盖数为 0；
- 所有 accepted 记忆都有来源、validation event 和 policy trace；
- 审计链能解释每次状态变化。

## 9. 重建与恢复

至少执行一次演练：

1. 保存原始文件、规范化知识、领域记录、配置和审计备份；
2. 在空 runtime 目录启动；
3. 从文件重建 SQLite、FTS、向量和视图；
4. 运行 gold set；
5. 比较重建前后记录数、来源边和答案；
6. 验证未将 rejected/candidate 错误纳入默认检索。

正式门槛：

- 规范记录和关系计数一致；
- accepted 记忆一致；
- 关键 gold 问题结果无实质回退；
- 无人工修改数据库才能完成的步骤。

### 9.1 0.5 revision 与 Worker 恢复

必须额外验证：

1. canonical 内容写入不可变 `revisions/<knowledge-revision>/`，派生索引写入不可变 `indexes/<index-revision>/`；RevisionManifest 发布后固定为 `published`，`manifest_hash` 必须等于移除自身字段后 RFC 8785 JCS UTF-8 bytes 的小写十六进制 SHA-256；单个 `current-revision.json` pointer 必须同时绑定 `{knowledge_revision, topology_revision, index_revision, manifest_hash}`，所有引用与哈希 ready 后才原子替换 pointer；
2. 在 revision 文件写入、fsync、pointer rename、snapshot swap 和索引构建的每个故障点杀死 Worker；
3. 每次恢复只能读到完整旧 revision 或完整新 revision，半提交可见数为 0；
4. staging 孤儿不会成为 current，恢复不需要人工修改文件；
5. 回滚通过新的补偿 revision 完成，不删除或改写旧 revision；
6. 停止/重启 Maintenance Worker 时 MCP Query Service 持续读取上一致 snapshot，查询失败率不因 Worker 生命周期上升；
7. SQLite 持久队列可恢复租约和幂等结果，不引入 Redis/Kafka；
8. 家庭节点故障时阿里回退只有 `project-read`，写工具和维护 Worker 均不可见。

正式门槛：半 revision 可见数 0；重复 commit 0；丢失已确认 event 0；Worker 故障导致的查询服务重启 0。

## 10. 0.5 Maintenance Harness 与冲突验收

必须建立独立契约 fixture 覆盖：

- 模型尝试调用 Shell、任意网络、SQL、公开 MCP 或直接 canonical 写工具；
- 模型借 `patch_main/patch_section/update_topology` 删除、改写、隐藏冲突摘要或 unlink `conflict_refs`；
- 模型对既有冲突提交后续 observation，验证目标 claim variant 存在，evidence/source 存在且同项目，指纹和密级有效；ConflictService 只能单调追加 evidence/source 和 `last_seen_revision`，重复 observation 幂等，且 claim 原义、status、resolution 均不变；
- 对 resolved 冲突提交反驳旧 resolution 的新证据，验证 append 被拒绝并新建引用旧 conflict/resolution 的 open 冲突；
- Markdown/Artifact 中包含提示注入，要求跳过证据或泄漏密钥；
- 相同 ChangePacket 重复运行、base revision 过期和并发事件合并；
- 用户答案分别产生单方取代、双方按 scope 同时成立、双方否定、候选拒绝和继续开放五类 typed outcome；
- 用户答案不足、原话哈希不符、身份无 capability、expected conflict revision 过期；共享 token 必须审计为 `client_attested/team-principal`，不得把 hash 当作人类原话证明，实名模式必须验证 identity claim 或可信客户端签名事件；
- 在 resolution record 写入、`open -> resolution_pending` 和 ChangePacket 入队各故障点中断 `lock_user_resolution`，验证三者全成或全不成；在文档/拓扑提交、typed outcome 与最终状态迁移各故障点中断 `apply_typed_resolution`，验证同事务提交；
- Worker 在 proposal、validation、staging 和 pointer publish 各阶段中断；
- 已加载 0.4 Skill 的在途任务在 0.5 切换后仍调用 legacy 写工具，服务只能返回 proposal-only ChangePacket、真实当前 revision、`migration_required` 和弃用元数据；下一任务加载 0.5 Skill 后不再调用 shim。

正式门槛：

- 禁止工具成功执行数为 0；
- 通用计划修改任何 conflict 保护字段数为 0；
- 维护模型自主关闭 open conflict 数为 0；
- 不带有效用户答案的 `resolution_pending/resolved` 迁移数为 0；
- 用户答案原义偏移率为 0；
- 冲突后续补证非单调更新数为 0，补证导致 claim/status/resolution 改变数为 0；
- 无效/跨项目/指纹不符/越密级 evidence observation 被接受数为 0；resolved 冲突的反证被静默追加且不生成新 open 冲突数为 0；
- 五类 typed outcome 均至少有一个通过样本；
- 相同 packet 重复知识、重复 revision 和重复费用作业数均为 0；
- stale revision 产生部分写入数为 0；
- Worker 默认 `max_tool_calls=8`、整个循环累计供应商输入 12000 tokens、单步上下文 6000 tokens、累计输出 3000 tokens、6 个分文件、40 条证据、12 个多模态资产、1 次正常生成＋最多 1 次 Schema 修复；Harness 必须累加每一步 provider usage，任一工具步数、累计 token、单步上下文、超时、资产、证据或部署费用上限越界成功数为 0；
- 语义校准默认每 7 天或累计 20 个 revision 按单领域触发；无漂移信号时必须 `no_change`，周期校准导致全库重写数为 0；
- legacy shim 直接修改 canonical/policy 状态数为 0，且从未把“已排队 proposal”误报为“已提交 revision”。

## 11. 上游兼容

每次同步上游需运行：

- 上游原有测试；
- 项目 profile 测试；
- Schema 和迁移测试；
- gold set 核心子集；
- MCP 工具列表快照；
- 空库与既有库启动测试。

若上游 API 变化，只能在适配边界修复，不能让领域文件格式随内部接口随意漂移。

## 12. 里程碑完成矩阵

每个 Phase 退出报告必须列出：

| 项目 | 内容 |
|---|---|
| 基线 | commit、配置、模型、机器、数据集版本 |
| 通过 | 自动测试、确定性断言和独立 Agent 验证 |
| 未通过 | 失败案例及严重度 |
| 未验证 | 明确尚未执行的路径 |
| 风险处置 | 策略记录、隔离项和明确未验证边界 |
| 下一阶段 | 允许进入的条件和遗留任务 |

## 13. No-Go 条件

出现以下任一情况不得宣称系统可正式使用：

- 原始文件无法验证完整性；
- 关键回答无法引用来源；
- 查询/执行 Agent 能调用管理能力，或任意 Agent 能强制接受/物理删除原件；
- 敏感资料在未确认时被外发；
- candidate 会进入默认检索；
- 索引无法从文件重建；
- 在只完成合成 fixture 时宣称真实资料质量已经通过；
- legacy `kb_update_main/kb_upsert_section/kb_reconcile_memory` 仍具有直接 canonical/policy 写语义、缺少 proposal-only/migration 元数据，或 `project-admin/project-ops` 仍作为默认公网 principal；
- Maintenance Worker 能直接写 canonical 文件、调用自己的 MCP 或修改 conflict 保护字段；
- 任一 0.5 多模态 gold 分桶低于门槛，或没有真实图片资源回传验证；
- 私有原视频被长期公开、签名 URL 无 TTL/审计、只处理关键帧却宣称原生视频理解，或在没有新增授权时上传原始音频；
- 百炼 API Key、Workspace region、endpoint 与所选模型不匹配；
- 多文件更新未通过 immutable revision＋单 pointer 发布，存在半 revision 可见窗口。
