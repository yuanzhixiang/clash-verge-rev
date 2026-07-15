# vergectl CLI

`vergectl` 是给本机 agent 和高级用户使用的命令行入口。CLI 只连接正在运行的 Clash Verge 应用，不做离线 YAML 编辑。

## 功能范围

- `status --json` 返回应用版本、运行模式、Clash 客户端信息、常用 Verge 开关和应用数据目录。
- `paths --json` 返回配置、profiles、runtime 和日志文件路径。
- `app info|paths|restart|exit|diagnostics export|open app|core|logs` 处理应用级信息、诊断、生命周期和目录打开。
- `system hostname|interfaces|interfaces-info|proxy get|auto-proxy get|port-in-use <port>|auto-launch get` 读取本机系统状态。
- `service status|install|uninstall|repair|reinstall` 复用现有 service/sidecar 管理能力。
- `config get verge|clash|runtime --format json|yaml` 读取当前应用内配置。
- `config patch verge|clash --json ...` 或 `--file ...` 通过应用后端 patch 配置，避免绕过运行时副作用。
- `clash info|mode get|mode set|core get|core set|delay|dns ...` 覆盖 Clash 信息、模式、核心切换、延迟测试和 DNS 配置文件流程。
- `runtime get|yaml|exists|logs|proxy-chain get|proxy-chain set` 暴露 runtime 配置和链式代理辅助能力。
- `profiles list|import|create|update|delete|reorder|patch|read-file|save-file|enhance|next-update` 覆盖 profiles 管理。
- `profiles convert <uid> --to conf [--force]` 将主 Profile 的声明 YAML 转为同 stem Surge-style CONF 覆盖；保留 YAML 原文件，并在写入前验证 CONF 往返语义。
- `proxies list|groups|providers|group|node|provider|select|delay|delay-group|healthcheck-provider|update-provider` 覆盖代理、代理组和 provider。
- `connections list|close|close-all` 覆盖连接观察和关闭。
- `rules list|providers|update-provider` 覆盖规则和 rule provider。
- `unlock list|check` 复用流媒体解锁检查。
- `backup create` 兼容旧命令；`backup local ...` 和 `backup webdav ...` 覆盖完整备份流程。
- `validate script --file <path>` 复用脚本校验。
- `watch traffic|memory|logs|connections` 以 JSON Lines 轮询输出，Ctrl-C 退出。
- `skill install` 安装随仓库维护的 `clash-verge-vergectl` agent skill。

## 连接与限制

- CLI 通过 `127.0.0.1` 访问应用 embedded server 的 `POST /commands/cli`。
- 默认先尝试正式端口 `33331`，再尝试 dev 端口 `11233`；`VERGECTL_PORT` 可覆盖端口。
- 无 token 鉴权，安全边界是 loopback 绑定和本机用户权限。
- 退出码：`0` 成功，`2` 应用不可达，`3` 参数错误，`4` 后端或渲染错误。
- destructive/disruptive 命令交给 agent skill 提醒先备份并确认用户意图。
- CONF 转换默认拒绝覆盖已有文件；`--force` 明确允许覆盖。转换只支持 local/remote 主 Profile，不处理 Merge、Rules、Proxies、Groups 扩展；旧 `--to toml` 作为无效参数拒绝。
