# 长翼久安线上 Agent

当前版本：`0.5.2`

面向团队成员的极简网页 Agent。浏览器只负责流式交互；Node 后端使用
Vercel AI SDK `ToolLoopAgent` 调用经过白名单限制的长翼久安 MCP 工具。

产物环境内置确定性文档工厂，可直接生成并持久化 DOCX、PPTX、XLSX、
Markdown、TXT、CSV、JSON、YAML 和代码文件。Office 二进制与 base64 上传
全部在服务器工具内部完成，不进入模型上下文。PDF 尚未开放，避免在没有
中文字体与版式转换验收的情况下提供伪支持。

交互支持 Auto、Fable 5、qwen3.8-max、qwen3.7-flash 四个选择；
Fable 5 与 qwen3.8-max 走增强模型，Auto 与 qwen3.7-flash 走快速模型，
四种选择均启用 thinking。输入栏左侧统一提供模型切换与文件上传；单个文件
当前上限为 8MB。进行中的请求可终止，完成后可在同一会话继续跟进。

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
