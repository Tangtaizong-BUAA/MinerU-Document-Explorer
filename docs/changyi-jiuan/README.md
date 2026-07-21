# 长翼久安知识库定向改造规划

> 文书状态：Draft v0.1
> 上游基线：`opendatalab/MinerU-Document-Explorer`
> 基线提交：`a7e9c6cc25b7edbf4ebd35aea8e270523a8a3e40`
> 本地工作分支：`feature/changyi-jiuan-kb`

本目录是“长翼久安”科研与社会实践综合项目知识库的规划真相源。首期采用文书先行：先冻结边界、数据契约、MCP 契约和验收口径，再进入核心代码改造。

## 目标结论

本项目不另起炉灶重写 RAG 引擎，而是在 MinerU Document Explorer 上增加五个特化层：

1. 长翼久安领域记录与结构化台账；
2. 原始文件到 Markdown 的可追溯摄取流程；
3. 面向 Agent 的低 token MCP 门面；
4. 任务完成后的候选记忆、校验、审批与晋升；
5. 可审计、可重建、可回滚的项目运维体系。

## 文书索引

| 文书 | 说明 | 状态 |
|---|---|---|
| [01-project-charter.md](01-project-charter.md) | 项目章程、范围、原则、角色、成功定义 | Draft |
| [02-target-architecture.md](02-target-architecture.md) | 目标架构、边界、上游复用点、部署拓扑 | Draft |
| [03-domain-model.md](03-domain-model.md) | 科研与社会实践统一领域模型 | Draft |
| [04-ingestion-provenance.md](04-ingestion-provenance.md) | 文件摄取、MinerU 转换、来源与版本治理 | Draft |
| [05-mcp-agent-contract.md](05-mcp-agent-contract.md) | 精简 MCP 工具面、资源 URI、Agent 行为契约 | Draft |
| [06-memory-lifecycle.md](06-memory-lifecycle.md) | 任务回传、候选记忆、审批、冲突与失效 | Draft |
| [07-roadmap.md](07-roadmap.md) | 分阶段实施路线、依赖和退出条件 | Draft |
| [08-acceptance-evaluation.md](08-acceptance-evaluation.md) | 检索、引用、token、可靠性和安全验收 | Draft |
| [09-decisions-and-open-questions.md](09-decisions-and-open-questions.md) | 已定原则、待确认产品问题和默认假设 | Active |
| [specs/domain-model.v0.1.yaml](specs/domain-model.v0.1.yaml) | 机器可读领域模型草案 | Draft |
| [specs/mcp-surface.v0.1.yaml](specs/mcp-surface.v0.1.yaml) | 机器可读 MCP 门面草案 | Draft |
| [reports/phase-0-baseline.md](reports/phase-0-baseline.md) | Fork、构建与上游测试基线验证报告 | Verified |

## 架构决策记录

- [ADR-0001：Fork MinerU Document Explorer](adr/0001-fork-and-upstream-strategy.md)
- [ADR-0002：原始文件不可变，Markdown 为规范知识载体](adr/0002-markdown-canonical-knowledge.md)
- [ADR-0003：记忆必须经过候选与晋升流程](adr/0003-controlled-memory-promotion.md)

## 当前保守默认值

在产品问题得到确认前，首版按以下安全默认值规划：

- 本地优先，首期单维护者；
- 单一高度特化项目，不建设通用 SaaS；
- 原始资料默认不离开本机；
- 普通 Agent 默认只读；
- 派生结论和经验不得未经审批进入正式记忆；
- SQLite、向量和缓存均为可重建派生物；
- 所有重要回答必须返回可核验的来源定位。

这些默认值是可逆的，不代表最终产品决定。待确认项集中记录在 [09-decisions-and-open-questions.md](09-decisions-and-open-questions.md)。

## 文书变更规则

1. 影响真相源、写权限或数据外发的决定，必须增加或修改 ADR。
2. 领域字段变更必须同步更新 `03-domain-model.md` 与 `specs/domain-model.v0.1.yaml`。
3. MCP 工具名称、参数或 token 预算变更必须同步更新 `05-mcp-agent-contract.md` 与 `specs/mcp-surface.v0.1.yaml`。
4. 阶段退出条件只允许在验收文书中修改，不能以“功能看起来可用”替代验证。
5. 文书状态按 `Draft → Accepted → Superseded` 演进，不静默覆盖历史决定。
