# Alibaba deployment contract

The online Agent is deliberately isolated from existing services:

- loopback service: `127.0.0.1:8801`
- systemd unit: `changyi-jiuan-agent-web.service`
- public path: `https://argonai.cn/cyj/agent/`
- MCP connection: authenticated `https://argonai.cn/cyj/mcp`
- environment: `/etc/changyi-jiuan-agent-web.env` (`0600`)
- browser access: Nginx Basic Auth using `/etc/nginx/.htpasswd-changyi-agent`

The service has no direct knowledge-base filesystem or database access. Its only
knowledge capability is the allowlisted MCP tool set in `server/index.mjs`.

Before every rollout, back up `/etc/nginx/sites-enabled/argon-kb`, run
`nginx -t`, then reload Nginx only after the test passes. Re-verify ports 8787,
8790, 8793, 8794, and 60193 after deployment.
