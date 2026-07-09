# 远程 Tauri Bridge

## 功能定位

`remote-tauri-bridge` 只用于浏览器里的前端开发模式，让 `pnpm web:remote` 连接已经运行的本机 Clash Verge App。

## 数据流

- 前端用 Tauri 官方 `mockIPC` 拦截 `invoke`。
- `main.tsx` 在 preload 前动态安装 bridge；被静态导入的页面/组件不能在模块顶层调用 Tauri window APIs，否则浏览器 dev 模式会早于 mock setup 执行。
- mock 命令通过 Vite 代理访问 `/__verge/cli`。
- Vite 代理转发到已运行 App 的 `127.0.0.1:33331/commands/cli`。
- Connections、Traffic、Logs 的 WebSocket 命令用轮询 CLI bridge 模拟，避免启动第二个 Tauri 后端。
- 常用 Tauri 插件命令提供浏览器内轻量 mock，例如 window、path、clipboard、dialog、shell、fs、process、http。

## 限制

- 这是 dev-only 能力，不参与生产运行。
- 只保证常用页面读数据和少量可逆操作；窗口控制、打开目录、退出 App 等命令在浏览器里是 no-op。
- 未映射命令必须抛错，方便开发时发现缺口。
