# Vite 配置

## 远程 App 开发代理

`web:remote` 使用 `VITE_VERGE_REMOTE_APP=1` 启动普通浏览器前端，并通过 `/__verge/cli` 代理连接本机已运行的 Clash Verge App。

默认代理端口是 `33331`，可用 `VERGE_REMOTE_PORT` 覆盖。代理只在 Vite dev server 中生效，不改变生产构建。

## 安全 Tauri 开发端口

- 安全启动器通过 `VERGE_DEV_PORT` 把动态空闲端口传给 Vite，并通过 Tauri 临时配置把 `build.devUrl` 指向同一地址。
- Vite 只监听 `127.0.0.1`，并启用 `strictPort`；端口在启动与实际监听之间发生竞争时必须失败，不能自动切换到 Tauri 不知道的新端口。
- 未设置 `VERGE_DEV_PORT` 的普通 `web:dev` 继续使用默认端口 3000。

## 安全只读 Relay

- `VITE_VERGE_REMOTE_READ_ONLY=1` 或 `VITE_VERGE_SAFE_TAURI=1` 时，不启用通用反向代理，改由 `/__verge/cli` 的安全 relay 处理请求。
- relay 只接受 POST，并按命令与 action 的精确读取白名单校验 payload；未知命令和所有修改命令在转发到正式 App 前返回 403。
- relay 设有 1 MiB 请求体上限与 10 秒上游超时。普通 `web:remote` 未开启只读变量时仍沿用现有通用代理行为。
- 安全 Tauri 模式下，Vite 将 `@tauri-apps/api/core` 定向到仅开发期生效的 invoke 适配层，避免覆盖 Tauri 2.11 的不可写原生 invoke；普通浏览器远程模式和生产构建不启用该适配层。
