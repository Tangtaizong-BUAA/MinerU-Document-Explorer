# 长翼久安知识库定向改造规划

> 文书状态：0.5.0 Implemented / Alibaba live gate verified
> 当前生产版本：0.5.0；家庭主节点提供 `project-contribute` 与独立 Maintainer，阿里 8794 提供 `project-read` 回退
> 上游基线：`opendatalab/MinerU-Document-Explorer`
> 基线提交：`a7e9c6cc25b7edbf4ebd35aea8e270523a8a3e40`
> 本地工作分支：`feature/changyi-jiuan-kb`

本目录是“长翼久安”科研与社会实践综合项目知识库的产品与架构真相源。0.5.0 的当前实施基线见 [11-v0.5-product-technology-stack.md](11-v0.5-product-technology-stack.md)；旧文档仍保留历史上下文，但与它冲突的服务器维护、冲突闭合、多模态检索和生产拓扑描述以 0.5.0 基线为准。

## 目标结论

本项目不另起炉灶重写 RAG 引擎，而是在 MinerU Document Explorer 上增加六个特化层：

1. 长翼久安领域记录与结构化台账；
2. 原始文件到 Markdown 的可追溯摄取流程；
3. 面向 Agent 的低 token MCP 门面；
4. 任务完成后的候选记忆、自动策略校验、隔离与晋升；
5. 可审计、可重建、可回滚的项目运维体系。
6. 只负责主/分文件、拓扑和冲突整理的低频服务器维护 Harness。

## 文书索引

| 文书 | 说明 | 状态 |
|---|---|---|
| [01-project-charter.md](01-project-charter.md) | 项目章程、范围、原则、角色、成功定义 | Draft |
| [02-target-architecture.md](02-target-architecture.md) | 目标架构、边界、上游复用点、部署拓扑 | Draft |
| [03-domain-model.md](03-domain-model.md) | 科研与社会实践统一领域模型 | Draft |
| [04-ingestion-provenance.md](04-ingestion-provenance.md) | 文件摄取、MinerU 转换、来源与版本治理 | Draft |
| [05-mcp-agent-contract.md](05-mcp-agent-contract.md) | 精简 MCP 工具面、资源 URI、Agent 行为契约 | Draft |
| [06-memory-lifecycle.md](06-memory-lifecycle.md) | 任务回传、自动记忆治理、冲突与失效 | Draft |
| [07-roadmap.md](07-roadmap.md) | 分阶段实施路线、依赖和退出条件 | Draft |
| [08-acceptance-evaluation.md](08-acceptance-evaluation.md) | 检索、引用、token、可靠性和安全验收 | Draft |
| [09-decisions-and-open-questions.md](09-decisions-and-open-questions.md) | 已定原则、待确认产品问题和默认假设 | Active |
| [10-visual-context-rag.md](10-visual-context-rag.md) | 0.4 已实现的图片关联基线与限制 | Implemented baseline |
| [11-v0.5-product-technology-stack.md](11-v0.5-product-technology-stack.md) | 0.5.0 产品边界、技术栈、多模态检索与维护 Harness | Implemented baseline |
| [12-client-deployment.md](12-client-deployment.md) | 三客户端、家庭主节点与阿里云只读回退部署 | Active |
| [specs/domain-model.v0.1.yaml](specs/domain-model.v0.1.yaml) | 机器可读领域模型草案 | Draft |
| [specs/domain-model.v0.5.yaml](specs/domain-model.v0.5.yaml) | 0.5 Evidence Unit、冲突、维护计划与 revision/snapshot 契约 | Implemented; live verified |
| [specs/mcp-surface.v0.1.yaml](specs/mcp-surface.v0.1.yaml) | 机器可读 MCP 门面草案 | Draft |
| [specs/mcp-surface.v0.5.yaml](specs/mcp-surface.v0.5.yaml) | 0.5 MCP profile、写入收口与冲突 capability | Implemented; live verified |
| [reports/v0.5-offline-implementation.md](reports/v0.5-offline-implementation.md) | 0.5 代码、离线验证、阿里 live gate 与发布状态 | Live verified |
| [reports/phase-0-baseline.md](reports/phase-0-baseline.md) | Fork、构建与上游测试基线验证报告 | Verified |

## 架构决策记录

- [ADR-0001：Fork MinerU Document Explorer](adr/0001-fork-and-upstream-strategy.md)
- [ADR-0002：原始文件不可变，Markdown 为规范知识载体](adr/0002-markdown-canonical-knowledge.md)
- [ADR-0003：记忆必须经过候选与晋升流程](adr/0003-controlled-memory-promotion.md)
- [ADR-0004：系统采用 Agent 全托管运维](adr/0004-agent-managed-autonomy.md)
- [ADR-0005：服务器维护 Agent 采用轻量工具循环与确定性 Harness](adr/0005-server-maintenance-agent-harness.md)

## 已确认运行约束

用户已确认首版按以下方式运行：

- 家庭服务器是唯一写入主节点，阿里云提供团队 HTTPS 入口和只读快照回退；
- 日常摄取、整理、索引和恢复由 Agent 全托管，不设置人工运维审批；
- 主要 MCP 客户端为 Qoder、Hermes Agent 和 Codex；
- 单一高度特化项目，不建设通用 SaaS；
- 原始资料默认本地保存；只有用户已授权范围内的项目资料可发送至 MinerU 云 API 和阿里百炼 API，外发必须留审计；
- 本地 Agent 负责项目工作与回答，MCP 负责证据和写回，服务器维护 Agent 只负责知识整理；
- 无冲突记忆可按证据策略自动晋升；冲突只能登记、路由和披露，不能由服务器模型自行裁决；
- 历史资料已开始接入；真实检索质量必须以实际项目评测集验证，不能用合成测试替代；
- SQLite、向量和缓存均为可重建派生物；
- 所有重要回答必须返回可核验的来源定位。

仍未确认的数据保密等级、备份目的地和百炼地域配置集中记录在 [09-decisions-and-open-questions.md](09-decisions-and-open-questions.md)；冲突解决身份已冻结为项目负责人和指定负责人。

## 文书变更规则

1. 影响真相源、写权限或数据外发的决定，必须增加或修改 ADR。
2. 领域字段变更必须同步更新 `03-domain-model.md` 与对应目标版本的 `specs/domain-model.v*.yaml`；已发布历史 spec 不原地改写。
3. MCP 工具名称、参数或 token 预算变更必须同步更新 `05-mcp-agent-contract.md` 与对应目标版本的 `specs/mcp-surface.v*.yaml`；已发布历史 spec 不原地改写。
4. 阶段退出条件只允许在验收文书中修改，不能以“功能看起来可用”替代验证。
5. 文书状态按 `Draft → Accepted → Superseded` 演进，不静默覆盖历史决定。
6. 0.5.0 设计文书落地不等于运行时发布；Server 与 Skill 同版本产物必须通过门禁后一起生成和发布，分布式客户端再通过握手、下一任务/重启和 legacy shim 分阶段激活。
