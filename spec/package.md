# package.json

## 开发脚本

- 使用 `pnpm` 执行项目脚本。
- `dev` 启动真实 Tauri 安全只读窗口：不启动开发核心、不修改系统网络，通过正在运行的正式 App 读取数据。
- `dev` 由安全启动器动态选择空闲前端端口；可通过 `VERGE_DEV_PORT` 指定端口，指定端口不可用时直接失败。
- `dev:diff` 与 `dev` 使用相同安全口径。
- `dev:unsafe` 保留原完整开发后端，只在明确需要调试核心、服务或网络功能时使用。
- `web:remote` 用于只启动浏览器前端，并连接本机已运行的 Clash Verge App。
- `web:remote` 默认监听 `127.0.0.1:47231`，使用 `--strictPort` 避免静默漂移到其它端口。
- 远程 App 后端端口仍通过 `VERGE_REMOTE_PORT` 覆盖，默认代理到 `33331`。
