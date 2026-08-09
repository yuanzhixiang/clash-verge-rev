# 安全 Tauri 开发启动器

## 模块职责

启动器为默认 `pnpm dev` 选择空闲前端端口、确认正式 App 可读取，并以 safe-dev feature 启动真实 Tauri 窗口。

## 启动流程

- 正式 App CLI 默认地址为 `127.0.0.1:33331`，可通过 `VERGE_REMOTE_PORT` 覆盖；连接失败时提示先启动正式 App，并且不启动 Vite 或 Tauri。
- 未指定 `VERGE_DEV_PORT` 时，通过绑定 `127.0.0.1:0` 获取系统分配的空闲端口；指定端口时先验证范围与可用性。
- 将选定端口同时写入子进程环境和 Tauri `--config` 的 `build.devUrl`，保证 Vite 与窗口地址一致。
- 临时 Tauri 配置将 identifier 覆盖为 `io.github.clash-verge-rev.clash-verge-rev.safe-dev`，使窗口状态和 Tauri 自身数据与正式 App、完整开发模式隔离。
- 启动时输出安全模式、CLI 端口、前端端口和 Tauri CLI 子进程 PID。
- SIGINT、SIGTERM 和子进程退出必须正确传播；启动器不能遗留 Vite、Tauri 或监听端口。

## 安全环境

- 子进程固定设置 `VITE_VERGE_REMOTE_APP=1`、`VITE_VERGE_REMOTE_READ_ONLY=1`、`VITE_VERGE_SAFE_TAURI=1`、`VITE_VERGE_REMOTE_PORT` 和 Cargo `safe-dev` feature。
- 启动器不读取或修改系统代理、DNS、路由、正式 App 配置和 Mihomo 进程。
- 提供 `--dry-run`，只校验正式 App、选择端口并输出命令，不启动子进程，供自动验证使用。

## 错误状态

- 端口非法、端口占用、正式 App 不可达或 Tauri CLI 启动失败均使用非零退出码。
- 自动端口在释放后若被其它进程抢占，由 Vite strict port 立即失败，不允许静默漂移。
