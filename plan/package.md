# package.json

## 开发脚本

- 使用 `pnpm` 执行项目脚本。
- `web:remote` 用于只启动浏览器前端，并连接本机已运行的 Clash Verge App。
- `web:remote` 默认监听 `127.0.0.1:47231`，使用 `--strictPort` 避免静默漂移到其它端口。
- 远程 App 后端端口仍通过 `VERGE_REMOTE_PORT` 覆盖，默认代理到 `33331`。
