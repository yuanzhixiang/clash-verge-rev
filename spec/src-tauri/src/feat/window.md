# 窗口退出与清理

## 模块职责

模块负责正式应用退出时保存配置，并停止核心、重置系统代理、关闭 TUN 和恢复 macOS DNS。

## Safe Dev 约束

- safe-dev 不进入正式 `quit` 和 `clean_async` 流程；生命周期事件直接结束安全开发窗口。
- 即使未来误调用 `clean_async`，安全模式也必须在读取配置或访问系统网络前立即返回。
- safe-dev 不保存 Clash、Verge 或 Profile 草稿，不停止核心、不连接 Mihomo 或 Service IPC，也不修改代理、TUN、DNS 和路由。

## 普通运行

- 正式应用和 `dev:unsafe` 保留现有配置保存、超时清理、退出码与日志行为。
