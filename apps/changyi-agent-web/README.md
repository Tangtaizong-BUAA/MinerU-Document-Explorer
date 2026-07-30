# 长翼久安线上 Agent

当前版本：`0.6.0`

面向团队成员的极简网页 Agent。浏览器只负责流式交互；Node 后端使用固定、
兼容 Node 22.13 的 Pi Agent Core 轻量运行时，连接经过白名单限制的长翼久安
MCP 工具，并通过百炼官方联网搜索补齐公开时效信息。Pi 的 Shell、代码编辑和
任意服务器文件访问均未开放。

产物环境内置确定性文档工厂，可直接生成并持久化 DOCX、PPTX、XLSX、
Markdown、TXT、CSV、JSON、YAML 和代码文件。Office 二进制与 base64 上传
全部在服务器工具内部完成，不进入模型上下文。PDF 尚未开放，避免在没有
中文字体与版式转换验收的情况下提供伪支持。

交互支持 Auto、Fable 5、qwen3.8max、qwen3.7-flash 四个选择；
Fable 5 与 qwen3.8max 优先走 Token Plan 的 `qwen3.8-max-preview`，
Auto 与 qwen3.7-flash 走快速模型，
四种选择均启用 thinking。输入栏左侧统一提供模型切换与文件添加；文件选择、
页面拖入和剪贴板粘贴共用同一条会话附件链路，单个文件上限为 80MB。进行中的请求可终止；新问题会平滑置顶，后续流式状态更新
不会推动页面跳动。Fable 5 对外仅使用 `Fable 5` 模型身份，不暴露底层路由。

用户文件不会因为“添加”就写入知识库：原件先进入隔离的会话临时目录，两小时
后过期。Agent 可提取 PDF/Office 文字、读取图片并将 PDF 页面作为视觉输入；
只有判断文件对长翼久安具有明确长期价值时，才通过受控工具晋升为 Artifact，
并随后提炼新增事实供维护 Worker 更新结构知识。大于单次 MCP 上限的原件使用
4MB 分块、偏移校验、SHA-256 校验和最终提交，不再把整份 Base64 塞进一次调用。

标准 DashScope Base URL 不提供 `qwen3.8-max-preview`。生产环境可通过
`CYJ_AGENT_MODEL_MAX=qwen3.7-max` 保持 Fable/增强模型按钮可用；接入 Token
Plan 专用 Base URL 和 API Key 后移除该兼容覆盖即可使用 3.8 preview。

## 生产入口

- URL: `https://argonai.cn/cyj/agent/`
- 用户名: `team`
- 密码位置: 阿里云 `/root/changyi-agent-team-credentials.txt`
- 服务: `changyi-jiuan-agent-web.service`
- 回环端口: `127.0.0.1:8801`

团队负责人可在有服务器权限的终端运行下列命令读取当前凭据：

```bash
ssh -i ~/.ssh/argon_kb_deploy root@47.95.109.140 \
  'cat /root/changyi-agent-team-credentials.txt'
```

## 本地验证

```bash
npm ci
npm run build
npm test
```

视觉验收、交互状态与线上端到端验证结果见 `design-qa.md`。
