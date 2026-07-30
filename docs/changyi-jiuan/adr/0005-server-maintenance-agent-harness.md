# ADR-0005：服务器维护 Agent 采用轻量工具循环与确定性 Harness

- 状态：Accepted
- 日期：2026-07-29
- 设计版本：0.5.0
- 修订：[ADR-0003](0003-controlled-memory-promotion.md) 的事实冲突自动取代边界、[ADR-0004](0004-agent-managed-autonomy.md) 的冲突自治含义

## 背景

项目需要在 Artifact 摄取、Agent closeout 和对话形成新项目信息后，持续维护主文件、分文件和拓扑。这个工作需要模型理解上下文，但服务器不能承担团队问答，也不能让非确定性的 Agent 直接改写正式知识。

当前 0.4.0 没有服务器 Agent Harness；`ProjectRuntime` 只有 MCP 工具和确定性策略。当前实现仍允许客户端直接更新主/分文件，并可能在补证后重新校验冲突候选。0.5.0 必须把这些差距作为迁移工作，不能把目标架构描述为现状。

## 决策

1. 服务器新增独立 `KnowledgeMaintenanceHarness` 和后台 Worker，不放进 MCP HTTP 请求循环。
2. 使用 Apache-2.0 的 ModelScope **MS-Agent 1.6** 作为可替换的原生全模态工具循环内核，默认模型固定为 `qwen3.7-flash`。
3. MS-Agent 隔离 Python Worker 只负责模型调用、原生 text/image/video message、受限只读工具、停止条件和结构化 `MaintenancePlan`；项目自有 Node 代码负责队列、租约、幂等、revision、证据校验、冲突策略、原子提交、审计和回滚。
4. 维护模型不通过 MCP 调用本服务。MCP adapter 与 Maintenance adapter 复用同一 application service。
5. 维护模型没有直接文件写入、Shell、任意网络、SQL、问答、`update_main`、`upsert_section`、`force_accept` 或 `resolve_conflict` 工具。
6. 模型只允许提出 `patch_main`、`patch_section`、`create_section`、`update_topology`、`register_conflict`、`observe_conflict` 或 `no_change`；`observe_conflict` 只产生受约束 observation，不能直接写既有冲突。
7. 事实冲突一旦登记，只能由明确的用户答案进入解决流程。来源等级、时间先后、模型判断或新文件版本都不能自动关闭语义冲突。
8. existing conflict 记录、状态、`conflict_refs` 和冲突摘要是 Harness 保护字段，通用文档/拓扑补丁不得修改、删除、隐藏或断开；模型只能提出新增 `open` 冲突或绑定目标 claim variant 的后续 evidence observation。专用 ConflictService 的补证事务必须验证证据存在、同项目、指纹与密级，只允许单调追加 evidence/source 与 `last_seen_revision`，不能改 claim 原义、状态或 resolution；resolved 冲突遇到反证时必须新建引用旧 resolution 的 open 冲突。
9. 查询和回答继续由 Codex、Qoder、Hermes 在客户端执行；查询热路径绝不调用服务器维护模型。
10. 家庭服务器继续是唯一写者；阿里云回退节点只读且不运行维护 Worker。
11. 0.5 团队默认 MCP profile 为 `project-contribute`；冲突答案使用独立 `project-resolve` capability；`project-ops` 只在家庭 loopback/受限 service principal。legacy 工具在一个 Skill 窗口内只能作为 proposal-only shim，绝无 canonical/policy 直接写语义；Worker 不走 MCP。
12. 持久队列使用现有文件＋SQLite 技术栈，不引入 Redis/Kafka；canonical 和派生 index 使用彼此独立的不可变 revision 目录，单个 `current-revision.json` pointer 原子绑定 `{knowledge_revision, topology_revision, index_revision, manifest_hash}`，不假设多文件 rename 原子。`manifest_hash` 为移除自身字段后 RFC 8785 JCS UTF-8 bytes 的小写十六进制 SHA-256；RevisionManifest 发布后状态固定为 `published`，current/superseded 由 pointer 与追加事件派生。
13. 百炼模型 tuple 固定记录北京地域、业务空间 endpoint、API dialect、模型 ID 和 key reference。视频必须作为原生 `video_url` content 进入 `qwen3.7-flash`（优先受控 Base64 data URI，或受审计短时签名 URL）；关键帧/OCR/转写仅作召回和 locator 辅助，不能冒充原生视频理解。0.5 不新增独立音频 ASR。
14. Harness 使用版本化 `maintenance-budget/v1`：最多 8 次工具，整个循环累计计费输入 12000 tokens、单步上下文 6000 tokens、累计输出 3000 tokens，最多 6 个分文件、40 条证据、12 个多模态资产、1 次生成加 1 次 Schema 修复；必须累加供应商逐步 usage，费用上限缺失或预计越界时 fail closed。语义校准默认每 7 天或累计 20 个 revision 按单领域触发，不做周期性全库重写。

## 框架选择理由

MS-Agent 1.6 明确支持 Agent 多模态消息中的图片与视频、OpenAI-compatible/DashScope 模型、工具调用、token 监控和上下文压缩，满足“视频不能先降格为关键帧”的硬约束。为控制技术栈增量，它只作为独立 Python Worker，使用 JSONL/stdio 接收有界 ChangePacket、受控媒体描述符并返回严格 Schema；Node.js 22/TypeScript/Zod 仍是 MCP、领域服务、队列、校验和提交的主栈。

MS-Agent 不拥有项目状态。本项目模型阶段没有真实写副作用；Worker 崩溃时丢弃计划并从持久 ChangePacket 重试，比把 canonical 状态托管给 Agent 框架更安全。

资源受限节点只安装该 Worker 实际使用的 MS-Agent 运行面。`ms-agent==1.6.0` 本体以 `--no-deps` 锁定，显式依赖清单位于 `deploy/home/requirements.txt`；本地训练、向量化、绘图和媒体编辑依赖不进入镜像。项目的全模态理解来自 DashScope 原生 API，不在服务器本地加载 Torch/CUDA 模型。

## 备选方案

- **LangGraph.js**：若未来出现跨天、多级暂停恢复和复杂分支，作为第二候选；当前会重复已有 queue/revision 状态机。
- **OpenAI Agents JS**：工具 guardrail 完整，但阿里模型需要额外适配，且运行语义更偏 OpenAI。
- **Mastra / VoltAgent**：平台能力过宽，会重复 MCP、工作流、存储和观测层。
- **Vercel AI SDK**：Node 同栈，但原生视频 Agent message 不是当前稳定硬契约，不能满足本项目门槛。
- **Qwen-Agent / PydanticAI**：Qwen-Agent 保留为 Qwen 生态回退，但公开视频 Agent message 契约不如 MS-Agent 1.6 明确；PydanticAI 不提供额外价值。
- **完整自研循环**：没有必要重复标准模型工具循环与 Provider 兼容逻辑。

## 代码级边界

框架必须实现并且只能通过下列适配接口进入项目：

```ts
interface MaintenanceAgentAdapter {
  propose(
    packet: ChangePacket,
    tools: MaintenanceReadTools,
    budget: MaintenanceBudget,
  ): Promise<MaintenancePlan>;
}
```

内部模型工具仅包含：

```text
read_change_packet
read_document_blocks
read_evidence
read_topology_neighborhood
search_maintenance_evidence
find_open_conflicts
submit_maintenance_plan
finish_no_change
report_insufficient_evidence
```

除终止工具外全部只读；终止工具只返回结构化对象，没有 commit side effect。`MaintenancePlan` 经过项目 validator 后才能进入 staging 和原子提交。

## 冲突修订说明

本 ADR 对旧文档作如下明确修订：

- “Agent 全托管”仍然成立，但冲突处理只包括发现、登记、路由、披露和收集补证，不包括机器裁决事实真伪。
- 自动晋升只适用于无冲突且通过确定性证据门槛的内容。
- 任何已进入 `open/disputed` 的语义冲突都不能因所谓“严格胜序”自动 supersede。
- 用户明确答案是关闭事实冲突的唯一语义授权；Harness 仍需验证 revision、幂等和补丁没有偏离原意。
- 用户答案可以得到单方取代、双方按时间/作用域同时成立、双方否定、候选拒绝或继续开放等 typed outcome，不能被强迫映射为 `superseded`。
- 冲突状态只由 `register_open_conflict`、`lock_user_resolution` 和 `apply_typed_resolution` 三笔专用事务改变；前者新建 open，中者原子保存用户记录、置 pending 并入队，后者与文档/拓扑补丁同事务置 resolved 或退回 open。通用 patch 永远不能写 conflict 保护字段；补证事务不改变状态。
- 用户没有回答时，冲突保持开放并随相关检索返回，不阻塞无关知识维护。

## 后果

积极：

- 服务器模型成本只发生在增量整理，不承担团队日常问答；
- Agent 框架可替换，不污染 MCP、领域模型和 canonical repository；
- 模型错误会在 staging/validator 阶段失败关闭；
- 冲突不会被自动“整理掉”；
- Worker 故障不会拖垮查询服务。

代价：

- 需要自行实现持久队列、revision manifest、validator 和补偿回滚；
- 0.4 的直接文档写工具需要兼容迁移；
- 需要为项目负责人和指定负责人发放独立 resolver capability；团队共享 token 永远不得获得该能力；
- 已复用 ArgonType 受管环境中的 Key 完成北京区 live gate；Key 不进入仓库、知识文档或查询服务；
- `qwen3.7-flash` tool-calling、图片、原生视频和完整 MS-Agent Worker 已通过，`qwen3-vl-embedding` 文本/图片/视频向量已通过；后续变更 endpoint、地域、Key 或模型必须重跑。

## 发布门禁

在以下条件全部满足前，不把运行时、镜像或 Skill 标为 0.5.0：

- 工具 allowlist 和禁止工具测试通过；
- 同一 ChangePacket 重试幂等；
- revision 冲突不产生部分写入；
- 维护模型无法关闭 open conflict；
- 用户答案原义传播测试通过；
- Worker 故障时 MCP 可持续读取旧快照；
- immutable revision＋单 current pointer 的逐故障点注入中半 revision 可见数为 0；
- 北京 region/endpoint/key/model tuple 验证通过，原生视频输入确实到达模型且外发受 Artifact policy 审计；
- 家庭主写与阿里只读回退故障注入通过；
- Server、Skill、prompt、tool schema 和 index version 的同版本产物一起生成和发布；客户端通过握手、下一任务/重启和 legacy shim 分阶段激活。

## 参考

- [ModelScope MS-Agent](https://github.com/modelscope/ms-agent)
- [MS-Agent 1.6.0](https://github.com/modelscope/ms-agent/releases/tag/v1.6.0)
- [MS-Agent multimodal support](https://github.com/modelscope/ms-agent/blob/main/docs/zh/Components/multimodal-support.md)
- [Alibaba Qwen vision model capabilities](https://help.aliyun.com/en/model-studio/vision-model/)
- [OpenAI-compatible Provider](https://ai-sdk.dev/providers/openai-compatible-providers)
- [Apache-2.0 License](https://github.com/vercel/ai/blob/main/LICENSE)
