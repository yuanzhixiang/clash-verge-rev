# vergectl CLI

`vergectl` 是给本机 agent 和高级用户使用的精简命令行入口。v1 只连接正在运行的 Clash Verge 应用，不做离线 YAML 编辑。

## 功能范围

- `status --json` 返回应用版本、运行模式、Clash 客户端信息、常用 Verge 开关和应用数据目录。
- `paths --json` 返回配置、日志和 runtime 文件路径。
- `config get verge|clash|runtime --format json|yaml` 读取当前应用内配置。
- `config patch verge|clash --json ...` 或 `--file ...` 通过应用后端 patch 配置，避免绕过运行时副作用。
- `logs app|core --lines N` 读取应用日志或核心日志。
- `core mode|start|stop|restart` 控制核心生命周期。
- `backup create` 调用现有本地备份能力。
- `skill install` 安装随仓库维护的 `clash-verge-vergectl` agent skill。

## 连接与限制

- CLI 通过 `127.0.0.1` 访问应用 embedded server 的 `POST /commands/cli`。
- 默认先尝试正式端口 `33331`，再尝试 dev 端口 `11233`；`VERGECTL_PORT` 可覆盖端口。
- 无 token 鉴权，安全边界是 loopback 绑定和本机用户权限。
- 退出码：`0` 成功，`2` 应用不可达，`3` 参数错误，`4` 后端或渲染错误。

