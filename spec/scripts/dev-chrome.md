# dev-chrome.mjs（pnpm dev:chrome）：规则测试浏览器

## 功能定位

启动一个独立的 Chrome 实例，所有流量走 dev 实例的 mixed 端口，用于验证规则命中与策略切换，不影响日常浏览器。

## 行为

- 二进制查找：`CHROME_BIN` 环境变量 > macOS 的 Google Chrome / Chromium 应用路径 > PATH 中的 google-chrome / chromium。
- 启动参数：`--user-data-dir=<dev 配置目录>/dev-chrome-profile`（独立浏览器档案）、`--proxy-server=http://127.0.0.1:7900`（`VERGE_DEV_MIXED_PORT` 保持与 dev 实例一致）、`--no-first-run`、`--no-default-browser-check`。
- 首个非 `-` 开头的位置参数作为启动打开的 URL：`pnpm dev:chrome https://example.com`。
- 进程 detached 启动，脚本立即返回。

## 规则测试工作流

1. `pnpm dev` 启动隔离实例。
2. `pnpm dev:chrome` 打开测试浏览器，访问目标域名。
3. dev 窗口 Connections 页查看每条连接命中的规则与策略链；或 `VERGECTL_PORT=11233 vergectl connections list` / `vergectl watch connections`。
4. 在 dev 窗口 Proxies 页编辑规则/策略（写 dev 环境的 Local profile，保存即热重载），刷新页面重新访问验证。
5. REJECT 规则验证：对应域名在测试浏览器中应加载失败；策略切换验证：Connections 中 chain 变化。
