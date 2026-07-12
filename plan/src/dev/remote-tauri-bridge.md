# 远程 Tauri Bridge

## 功能定位

`remote-tauri-bridge` 用于浏览器远程模式，以及 `pnpm dev` 的真实 Tauri 安全只读模式，让开发前端连接已经运行的本机正式 Clash Verge App。

## 数据流

- 普通浏览器远程模式用 Tauri 官方 `mockIPC` 拦截 `invoke`。
- 普通浏览器远程模式必须先通过 `mockWindows`、`mockConvertFileSrc` 创建 Tauri internals，再读取并补充 path plugin、安装 `mockIPC`；不得在 mock 初始化前访问 internals。
- `main.tsx` 在 preload 前动态安装 bridge；被静态导入的页面/组件不能在模块顶层调用 Tauri window APIs，否则浏览器 dev 模式会早于 mock setup 执行。
- mock 命令通过 Vite 代理访问 `/__verge/cli`。
- Vite 代理转发到已运行 App 的 `127.0.0.1:33331/commands/cli`。
- Connections、Traffic、Logs 的 WebSocket 命令用轮询 CLI bridge 模拟，避免启动第二个 Tauri 后端。
- 常用 Tauri 插件命令提供浏览器内轻量 mock，例如 window、path、clipboard、dialog、shell、fs、process、http。
- 安全 Tauri 模式不安装 `mockIPC`，也不直接覆盖 Tauri 2.11 中不可写的原生 `internals.invoke`。Vite 仅在 `VITE_VERGE_SAFE_TAURI=1` 时把 `@tauri-apps/api/core` 导向开发期 invoke 适配层：Window 与 Event 命令委托回当前开发窗口，其它命令进入只读远程 bridge，从而保留真实标题栏、窗口控制、尺寸、主题与拖拽行为。
- 安全 Tauri 模式直接使用 WebView 已创建的原生 Tauri internals；两种模式若在各自初始化完成后仍无法取得 internals，必须立即抛出明确错误，不得带着空数据继续启动。

## 只读策略

- `VITE_VERGE_REMOTE_READ_ONLY=1` 时使用默认拒绝白名单；只有配置与状态读取、Profiles/Rules/Connections/Logs 查询及轮询可以访问正式 App CLI。规则集合内容读取仅按 provider 名称调用后端受限命令，属于允许的只读 Rules 查询。
- 代理选择、连接关闭、规则与 Profile 编辑、配置 patch、核心/服务控制、Provider 更新、备份写入及系统代理/TUN 操作必须在发出 HTTP 请求前拒绝。
- 只读约束在 invoke 命令和 CLI payload 两层执行；Vite 的 `/__verge/cli` relay 还会在服务端重复校验，页面不能通过直接 POST 绕过前端 bridge。
- 安全模式中的 HTTP 插件只允许 `GET` 与 `HEAD`，其它方法在创建请求前拒绝。
- 本地开发窗口的 Window/Event 命令不属于正式 App 写操作，可以原生执行。
- 被阻止的命令返回包含命令名的 Safe Dev 只读错误，不模拟成功，也不改变正式 App。

## 限制

- 这是 dev-only 能力，不参与生产运行。
- 浏览器 `web:remote` 未显式启用只读变量时保持现有行为；严格只读只作为默认 `pnpm dev` 的安全边界。
- 浏览器模式的窗口控制仍为 no-op；安全 Tauri 模式使用真实本地窗口命令。
- `reveal_profile_file` 在浏览器远程模式中为 no-op，不启动 Finder、Explorer 或 Linux 文件管理器；生产 Tauri 运行时仍执行真实定位命令。
- 未映射命令必须抛错，方便开发时发现缺口。
