# Phase 0：Fork 与基线验证报告

> 验证日期：2026-07-21
> 报告状态：Verified
> 验证范围：上游运行时基线 + 长翼久安规划文书；尚未进入功能代码改造

## 1. 基线身份

| 项目 | 值 |
|---|---|
| 上游仓库 | `opendatalab/MinerU-Document-Explorer` |
| 用户 Fork | `Tangtaizong-BUAA/MinerU-Document-Explorer` |
| 上游基线提交 | `a7e9c6cc25b7edbf4ebd35aea8e270523a8a3e40` |
| 工作分支 | `feature/changyi-jiuan-kb` |
| package 版本 | `1.0.9` |
| 操作系统 | macOS 15.7.1（24G231） |
| Bun | `1.3.12` |
| Node.js | `v25.7.0` |

远程仓库关系：

- `origin`：`https://github.com/Tangtaizong-BUAA/MinerU-Document-Explorer.git`
- `upstream`：`https://github.com/opendatalab/MinerU-Document-Explorer.git`

## 2. 验证结果

| 检查 | 命令或方法 | 结果 |
|---|---|---|
| 依赖锁定安装 | `bun install --frozen-lockfile` | 通过；安装 297 个 package |
| TypeScript / 分发构建 | `bun run build` | 通过 |
| YAML 语法 | Ruby `YAML.load_file` 解析两份规范 | 通过 |
| Markdown 本地相对链接 | 对规划目录执行链接存在性检查 | 通过 |
| 补丁空白错误 | `git diff --check` | 通过 |
| 上游 CI 模式全量基线 | `CI=1 bun run test` | 25 个文件通过，3 个文件失败；998 项通过、1 项失败、80 项跳过 |
| 排除已定位的上游基线缺口 | `CI=1 bun run test --exclude test/eval-bm25.test.ts --exclude test/eval.test.ts --exclude test/vec0-graceful.test.ts` | 25/25 个文件通过；995 项通过、63 项跳过 |

## 3. 已确认的上游基线缺口

### 3.1 评测语料未随仓库提供

`test/eval-bm25.test.ts` 与 `test/eval.test.ts` 均读取 `test/eval-docs`，但当前上游提交中不存在该目录，因此两个 suite 在初始化阶段以 `ENOENT` 失败。

这意味着当前仓库无法独立复现其 BM25、向量与混合检索质量阈值。长翼久安项目后续应建立自己的黄金问题集和版本化评测语料，不能把这两个缺失 fixture 的测试视为质量证明。

### 3.2 CI 与 vec0 降级测试的假设冲突

`test/vec0-graceful.test.ts` 的“无 vec0 时混合检索退化为 BM25”用例仍调用 `embedBatch`；而 `CI=1` 会显式禁用 LLM 操作，因此该用例抛出 `LLM operations are disabled in CI`。

这是测试环境约束与用例路径之间的冲突，不是本次规划文书引入的回归。进入功能改造后，应为该路径注入可控 embedding stub，或将降级逻辑测试拆成纯单元层。

### 3.3 Git hook 安装脚本不可执行

依赖安装的 `prepare` 阶段尝试执行 `./scripts/install-hooks.sh`，当前上游文件缺少可执行位，出现 `Permission denied`。由于脚本调用尾部带有 `|| true`，依赖安装仍成功完成。

该问题不影响当前构建和测试，但会导致开发者误以为 hooks 已安装。后续可作为独立上游兼容修复处理。

## 4. 本轮明确未验证的能力

本轮刻意没有下载或运行真实 GGUF 模型，因此以下能力尚不能标记为通过：

- embedding 的真实维度、性能和召回质量；
- Qwen3 reranker 的真实排序质量；
- query expansion 的真实生成质量；
- 长翼久安真实语料上的 token 成本与答案准确率；
- MinerU 对项目历史 PDF、扫描件、图片、DOCX、PPTX 的转换质量。

这些项目属于 Phase 1 语料盘点和 Phase 2 摄取流水线的验收范围。首次模型下载及缓存位置应在容量预算确认后执行，不在基线验证中隐式触发。

## 5. 结论

当前 Fork、上游跟踪关系和规划文书可以作为后续改造起点：

- 上游项目可正常安装并构建；
- 不依赖真实本地模型的干净回归全部通过；
- 三个剩余失败均已定位为上游基线或 fixture 问题；
- 本轮只增加文书和规范，没有改变运行时代码；
- 可以进入 Phase 1：真实资料只读盘点、目录规则与最小垂直切片实现。

## 6. 下一阶段入口条件

进入真实资料摄取前，需要至少确认：

1. 第一批资料所在目录及是否允许递归只读盘点；
2. 是否包含涉密、个人信息或不可上传的材料；
3. 首期主要调用端是 Codex、Claude Desktop、OpenClaw，还是其他 MCP 客户端；
4. 第一阶段是否继续采用“单维护者 + 本地优先 + 记忆人工审批”的默认方案。

## 7. 基线后的已确认决策

本报告完成后，用户已确认：

- 主要 MCP 客户端为 Qoder、Hermes Agent 和 Codex；
- 系统正常运行全托管于 Agent，不设置人工记忆审批或人工运维队列；
- 历史资料暂不提供，先使用合成 fixture 实现和验证垂直切片。

这些决定不改变本报告中的上游测试事实，但取代第 6 节中相应的待确认项。当前设计以 [ADR-0004](../adr/0004-agent-managed-autonomy.md) 和 [决策记录](../09-decisions-and-open-questions.md) 为准。
