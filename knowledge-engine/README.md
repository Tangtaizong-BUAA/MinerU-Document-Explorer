# Knowledge engine · 两种部署，共用内核

把原始资料、结构化主文件与分文件、文本和图片 RAG、可追溯证据、Jev 建议及异步维护放在同一套知识系统中。此发布包来自 MinerU-Document-Explorer 的现有知识内核，不包含长翼久安的知识正文、成员令牌、服务器配置、学校连接器或用户数据库。

| 模式 | 访问方式 | 适用场景 |
| --- | --- | --- |
| `local` | 客户端启动 stdio MCP，或认证的 loopback HTTP | 自己电脑上的个人知识库，只有部署者一个 owner |
| `cloud` | HTTPS Streamable HTTP MCP，成员独立令牌 | 多人检索、上传资料、协作产出和持续维护 |

两种模式共用 `ProjectRuntime`、检索投影、解析流程、维护队列和 Harness。安装地点不同，不另建两套知识正文或两套检索算法。标准 MCP 客户端均可接入，无需 OpenAI 插件。

## 从源码取得独立包

在开源仓库根目录执行：

```sh
cd knowledge-engine
npm ci
npm run build
```

`knowledge-engine` 是可独立安装的完整源码包。维护者从包含当前内核的原工作区更新发布包时，可执行只依赖 Node 内置库的导出器：

```sh
node scripts/export-knowledge-engine.mjs
cd release/knowledge-engine-open-source
npm ci
npm run build
```

首次从源码导出尚无 lockfile 时，先执行 `npm install` 生成它。发布归档内附有已验证的 lockfile，可直接 `npm ci`。需要 Node.js 22 或 24；本地处理 PDF/图片还需要 Python 3.10+：

```sh
python3 -m pip install -r deploy/requirements.txt
```

Word、PowerPoint、Excel、Markdown 和普通文本的本地标准化保留原件，不执行宏、公式或外部关系。没有启用 OCR 的扫描件会显示解析缺口。默认不向外部服务发送材料。

## 个人电脑模式

```sh
node bin/knowledge-mcp init local --dir ./my-kb --name "我的知识库"
```

初始化会创建一个空白项目、单一 owner、私有邀请文件及该实例的 Skill。不会扫描或导入电脑上的其他文件。将 `my-kb/mcp.stdio.json` 中的条目合并到支持 stdio 的 MCP 客户端；其命令会启动服务和后台索引/维护进程。该 JSON 不含访问令牌。一个客户端不支持 stdio 时可使用本机 HTTP：

```sh
node bin/knowledge-mcp serve --config ./my-kb/knowledge.config.json --http
```

随后使用 `my-kb/mcp.http.json` 中的连接配置。HTTP 仅绑定 loopback，且仍需要 owner 令牌。个人 owner 可以读取自己的受限资料，个人模式拒绝创建其他成员。Skill 的导出目录为 `my-kb/client-skill`；将其装入客户端实际支持的 Skill 目录。每个部署的 Skill 名称、项目 ID、文件哈希和通知身份均独立。

部署数据、配置、令牌及邀请都放在指定的私有目录中。原件、normalized 文件和 revisioned Markdown 是持久数据；SQLite 搜索索引可重建。`init` 拒绝覆盖已有目录，升级程序应保留数据目录。

### 个人 Docker 虚拟服务器

```sh
docker compose -f deploy/compose.local.yaml build mcp
docker compose -f deploy/compose.local.yaml run --rm setup
docker compose -f deploy/compose.local.yaml up -d mcp indexer maintainer
docker compose -f deploy/compose.local.yaml cp mcp:/state/instance/mcp.http.json ./personal.private.json
```

只有 `127.0.0.1:8793` 发布到宿主机。服务容器内的 `0.0.0.0` 用于 Docker 转发，不会把个人端口发布到局域网。私有数据存放于独立 named volume。`setup` 仅首次运行。

## 多人云端模式

原生部署可用同一 CLI：

```sh
node bin/knowledge-mcp init cloud --dir ./team-kb --name "团队知识库" --public-url https://kb.example.org/mcp
node bin/knowledge-mcp serve --config ./team-kb/knowledge.config.json --http
```

将你自己的 HTTPS 反向代理指向 `127.0.0.1:8793/mcp`；公网 URL、域名和 TLS 均由部署者配置。没有默认的长翼久安入口或共享令牌。

完整 Docker 部署包含 MCP、独立索引器、独立维护器和 Caddy HTTPS 入口：

```sh
export KB_DOMAIN=kb.example.org
export KB_PROJECT_NAME="团队知识库"
docker compose -f deploy/compose.cloud.yaml build mcp
docker compose -f deploy/compose.cloud.yaml run --rm setup
docker compose -f deploy/compose.cloud.yaml up -d mcp indexer maintainer https
```

域名需指向这台服务器；Caddy 使用该域名取得证书。MCP 容器没有对宿主机发布 8793 端口。贡献者和读者不会取得运维或冲突裁决能力。

```sh
# 在服务器上，为 Alice 创建可读取、检索及上传的独立权限
node bin/knowledge-mcp member issue --config ./team-kb/knowledge.config.json --id alice --role contributor --out ./alice.private.json
# 查看成员时不显示令牌或令牌哈希
node bin/knowledge-mcp member list --config ./team-kb/knowledge.config.json
# 不重启服务即可撤权，包括已存在的 HTTP 会话
node bin/knowledge-mcp member revoke --config ./team-kb/knowledge.config.json --id alice
```

Docker 中的等价管理命令为 `docker compose -f deploy/compose.cloud.yaml exec mcp node dist/cli/knowledge.js member ...`，其中 `--config` 已由容器环境指定；邀请输出使用 `/state/instance/invitations/` 内的路径，然后用 `docker compose cp` 导出供私下分发。

| 角色 | 权限 |
| --- | --- |
| `reader` | 主文件、导航、文本/图片检索、原文与原图、Skill 同步 |
| `contributor` | reader + 开始工作、上传文件、捕获上下文、完成工作 |
| `owner` | contributor + 明确用户指令下的冲突裁决 |
| `operator` | contributor + 资料登记、解析、覆盖检查和运维；不裁决冲突 |

服务端只保存令牌 SHA-256。令牌写入单独的私有邀请/客户端配置，不输出到命令行，也不嵌入 Skill。registry 原子替换，每次请求重新认证；角色降级也会使旧会话失效。一个部署服务一个共享项目，不宣称跨租户隔离；多个团队使用独立数据卷与配置。一个数据卷运行一个维护服务，避免无意义的并行模型费用。

### 成员安装

收到自己的私有邀请后，在本机运行：

```sh
node bin/knowledge-mcp client configure --invite ./alice.private.json --out ./mcp.private.json
node bin/knowledge-mcp client skill --invite ./alice.private.json --out /你的客户端确认的Skill目录
node bin/knowledge-mcp client doctor --invite ./alice.private.json
```

配置命令保留 JSON 中其他 MCP 条目。Skill 命令只更新受管文件、校验实际哈希、最后替换 manifest，然后再次向服务器核验。文件装好后需新会话加载。之后智能体每个任务自己检查版本。架构介绍按电脑和部署实例持久去重，更新 Skill、换客户端或重启不会重复；不能保存本地状态的云端智能体静默跳过。

## 启用 Qwen、MinerU 和 Jev

服务默认处于本地解析 + 结构导航 + 词法检索 + `catalog` 维护模式。`catalog` 通过 Harness 维护已解析来源的导航，不做模型摘要。图像可以按文件名、标题等元数据检索并读取原图；需要视觉语义匹配时启用 Qwen，并等待图片向量建立完成。

把自己的密钥填入私有部署目录的 `secrets.env`，再明确开启所需服务：

```sh
node bin/knowledge-mcp config providers --config ./my-kb/knowledge.config.json --qwen on --maintenance qwen
# 扫描 PDF OCR（会向 MinerU 提交 eligible 原件）
node bin/knowledge-mcp config providers --config ./my-kb/knowledge.config.json --mineru on --ocr on
# 后台有界关联建议。先观察 shadow；advisory 由部署者选择
node bin/knowledge-mcp config providers --config ./my-kb/knowledge.config.json --jev shadow
```

启用一个 provider 表示部署者允许该服务按文档化边界处理资料；仅配置 key 不会启用服务。Qwen 接收文本/图片检索材料及维护包；MinerU 接收明确选择的解析原件；Jev 只接收过滤后的有限证据和章节描述，不接收原始媒体、令牌或本地路径。受限、隔离、争议或跨项目证据不能因此晋升为事实。

本机启用 Qwen/MS-Agent 维护时还需：

```sh
python3 -m pip install -r deploy/requirements.providers.txt
python3 -m pip install --no-deps ms-agent==1.6.0
```

Docker 镜像已包括文档与模型适配依赖；私有 `--env-file` 可注入 `DASHSCOPE_API_KEY`、`MINERU_API_KEY`、`TYPESAFE_API_KEY`。在容器中修改 provider 配置后重建/重启 mcp、indexer、maintainer，使配置生效。单次检查和重建：

```sh
node bin/knowledge-mcp indexer --config ./my-kb/knowledge.config.json --once
node bin/knowledge-mcp maintainer --config ./my-kb/knowledge.config.json --once
node bin/knowledge-mcp status --config ./my-kb/knowledge.config.json
```

模型和 embedding 维度可通过私有环境配置覆盖；修改后重建向量空间。查询返回真实模型配置、降级状态和覆盖缺口，不把词法降级描述为语义搜索。

## 验证与架构说明

```sh
npm test
npm run build
```

验收使用合成资料覆盖真实 stdio 与 HTTP MCP、并发贡献、续页、原文/原图、维护提交、默认外发关闭、Skill 哈希修复、通知去重及即时撤权。Provider 协议与排序测试使用受控模拟响应，不代表对每个部署的真实语料已完成召回质量评测。你的域名证书及外部模型账户需在自己的部署环境验收。

完整机制见 [architecture](docs/architecture.md)。源码内保留部分 `CYJ_` 环境名、`cyj-*` 协议名和 ID 前缀，以兼容原有内核与已有客户端；这些标识不会加载原团队资料或凭据。

开源仓库：[MinerU-Document-Explorer](https://github.com/Tangtaizong-BUAA/MinerU-Document-Explorer)。许可证：[MIT](LICENSE)，原作者署名保留。
