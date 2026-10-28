# package.json

## 开发脚本

- 使用 `pnpm` 执行项目脚本。
- `dev` 启动与正式版隔离的完整开发实例（`scripts/dev-local.mjs`，`verge-dev` feature）：独立配置目录、IPC 和端口，系统代理 / 系统 DNS 全部 no-op，不使用系统服务，绝不触碰本机网络。详见 `spec/scripts/dev-local.md`。
- `dev:remote` 启动真实 Tauri 安全只读窗口（`scripts/dev-safe.mjs`）：不启动开发核心、不修改系统网络，通过正在运行的正式 App 读取数据；`dev:diff` 是它的别名。
- `dev:remote` 由安全启动器动态选择空闲前端端口；可通过 `VERGE_DEV_PORT` 指定端口，指定端口不可用时直接失败。
- `dev:unsafe` / `dev:trace` 同为 `verge-dev` 构建，享有与 `dev` 相同的系统网络隔离，但不做配置播种。
- `test:vm` 在 Tart macOS 虚拟机里安装正式构建并自动测试系统代理、服务、TUN、系统 DNS 等会改动系统网络的功能，测完销毁虚拟机。详见 `spec/scripts/vm-test.md`。
- `web:remote` 用于只启动浏览器前端，并连接本机已运行的 Clash Verge App。
- `web:remote` 默认监听 `127.0.0.1:47231`，使用 `--strictPort` 避免静默漂移到其它端口。
- 远程 App 后端端口仍通过 `VERGE_REMOTE_PORT` 覆盖，默认代理到 `33331`。

## 约束

- 不提供不带 `verge-dev` 的 `tauri dev` 入口。这类构建与正式版共用配置目录和系统服务，并真实修改系统代理与 DNS，会影响本机网络和正在运行的正式版。需要验证这些系统级行为时用 `test:vm`。

## 变更记录

- 2026-10-28：删除 `dev:tauri`（`tauri dev -f tauri-dev`，无 `verge-dev` 隔离）；新增 `test:vm`；修正 `dev` 的描述（2026-07-14 起已是隔离的完整开发实例，原只读窗口改名 `dev:remote`）。`tauri-dev` Cargo feature 仍保留，只控制 devtools 与日志行为。
