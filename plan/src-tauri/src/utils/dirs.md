# 应用目录与 IPC 路径

## 模块职责

模块为正式、普通开发和安全开发运行模式提供应用数据、日志、配置及 Mihomo IPC 路径。

## Safe Dev 隔离

- safe-dev 使用 `io.github.clash-verge-rev.clash-verge-rev.safe-dev` 应用数据目录和 `clash-verge-rev-backup-safe-dev` 备份命名；不与正式应用或普通 `verge-dev` 共用文件。
- Unix Mihomo IPC 使用独立的 `/tmp/verge-safe-dev/verge-mihomo.sock`，Windows 使用独立命名管道。
- 安全模式本身不启动核心；独立 IPC 只用于防御前端 bridge 失效或误调用时连接到正式 Mihomo。
- 正式 IPC `/tmp/verge/verge-mihomo.sock` 和生产命名管道保持不变。
