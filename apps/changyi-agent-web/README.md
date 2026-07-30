# 长翼久安线上 Agent

面向团队成员的极简网页 Agent。浏览器只负责流式交互；Node 后端使用
Vercel AI SDK `ToolLoopAgent` 调用经过白名单限制的长翼久安 MCP 工具。

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
