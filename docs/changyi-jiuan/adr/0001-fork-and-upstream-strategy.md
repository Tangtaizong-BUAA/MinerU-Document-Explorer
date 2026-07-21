# ADR-0001：Fork MinerU Document Explorer 并保持上游同步

- 状态：Accepted
- 日期：2026-07-21
- 决策人：项目负责人

## 背景

目标系统需要文档转换、混合检索、文档精读、Wiki 维护和 MCP。MinerU Document Explorer 已提供这些底层能力，重新实现会重复消耗时间并扩大风险。

## 决策

以 `opendatalab/MinerU-Document-Explorer` 为上游创建 GitHub fork：

- `origin`：`Tangtaizong-BUAA/MinerU-Document-Explorer`
- `upstream`：`opendatalab/MinerU-Document-Explorer`
- 初始特化分支：`feature/changyi-jiuan-kb`
- 初始基线：`a7e9c6cc25b7edbf4ebd35aea8e270523a8a3e40`

长翼久安特化能力优先通过新增领域、摄取、MCP profile 和 memory 模块实现，尽量减少对搜索核心的侵入性修改。

## 原因

- 上游采用 MIT 协议；
- 已有本地 SQLite、FTS5、向量和本地模型路径；
- 已有 PDF/DOCX/PPTX/Markdown 精读后端；
- 已有 MCP、Resource、Wiki 来源和增量摄取基础；
- 与 MinerU 生态兼容；
- fork 允许项目特化，同时保留上游修复和改进。

## 后果

积极：

- 更快进入真实资料验证；
- 复用现成测试和工具链；
- 项目可以持续吸收上游能力。

代价：

- 上游较新，接口可能变化；
- 需要维护同步、迁移和回归；
- 公共 fork 中不能加入真实敏感语料和密钥。

## 上游同步规则

1. 定期 fetch `upstream/main`；
2. 在集成分支完成合并或 rebase；
3. 运行上游测试、项目测试和 gold set 核心子集；
4. 通过后再进入项目主分支；
5. 可以通用化的修复尽量向上游贡献；
6. 高度特化的数据模型和记忆策略保留在项目模块。

## 备选方案

- 从零开发：否决，重复实现检索和文档后端；
- 以 RAGFlow 为底座：否决为首选，基础设施和产品边界过重；
- 以 Basic Memory 为底座：保留为设计参考，但复杂文档精读和 MinerU 集成不如当前方案直接；
- 直接使用上游而不 fork：否决，无法稳定承载特化功能和迁移。
