# 团队 MCP Token 管理

团队成员只接收无源码客户端包和一个个人 Token。服务端保留 Token 的 SHA-256，明文只在签发成功后显示一次。

家庭主节点安装管理员命令：

```bash
install -o root -g root -m 0750 deploy/scripts/cyj-team-token.py /usr/local/sbin/cyj-team-token
```

签发普通成员 Token：

```bash
sudo cyj-team-token issue member:<成员代号>
```

把输出 JSON 中的 `token` 通过端到端加密渠道单独发给该成员，不要发送整个 JSON、终端截图或服务器文件。成员只需把 Token 输入客户端安装脚本。

轮换、撤销和查看主体：

```bash
sudo cyj-team-token rotate member:<成员代号>
sudo cyj-team-token revoke member:<成员代号>
sudo cyj-team-token list
```

`issue`、`rotate`、`revoke` 会仅重建查询服务容器，健康检查或新 Token 冒烟测试失败时自动恢复原环境和主体注册表。Maintainer、阿里回退节点及其他端口不在操作范围内。

普通成员固定为 `project-contribute`，该命令不能签发 `project-resolve` 或 `project-ops`。负责人 Token 必须走单独审批和配置流程。
