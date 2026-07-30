# MCP 主体与 Resolver Token 管理

普通团队成员只接收无源码客户端包，不需要普通访问 Token：公网入口固定映射到 `project-contribute`。服务端保留管理员/resolver Token 的 SHA-256，明文只在签发成功后显示一次。

家庭主节点安装管理员命令：

```bash
install -o root -g root -m 0750 deploy/scripts/cyj-team-token.py /usr/local/sbin/cyj-team-token
```

签发负责人或指定负责人的 Resolver Token：

```bash
sudo cyj-team-token issue-resolver owner:<负责人代号> project-owner
sudo cyj-team-token issue-resolver resolver:<负责人代号> designated-resolver
```

把输出 JSON 中的 `token` 仅通过端到端加密渠道发给负责人；不要发送整个 JSON、终端截图或服务器文件。该 Token 不用于普通客户端安装，只用于负责人需要提交冲突裁决时的专用 MCP 配置。

轮换、撤销和查看主体：

```bash
sudo cyj-team-token rotate member:<成员代号>
sudo cyj-team-token rotate-resolver owner:<负责人代号> project-owner
sudo cyj-team-token revoke member:<成员代号>
sudo cyj-team-token list
```

`issue`、`rotate`、`revoke` 会仅重建查询服务容器，健康检查或新 Token 冒烟测试失败时自动恢复原环境和主体注册表。Maintainer、阿里回退节点及其他端口不在操作范围内。

普通匿名成员固定为 `project-contribute`，不具备 `project-resolve`、`project-ops`、原始资料摄取或 canonical 文档修改能力。`issue-resolver` 是 root-only 管理操作，只能签发 `project-owner` 或 `designated-resolver` 两种角色，且冒烟检查必须确认它实际能发现 `kb_submit_user_resolution`；它不能签发 `project-ops`。
