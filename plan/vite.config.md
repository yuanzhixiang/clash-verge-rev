# Vite 配置

## 远程 App 开发代理

`web:remote` 使用 `VITE_VERGE_REMOTE_APP=1` 启动普通浏览器前端，并通过 `/__verge/cli` 代理连接本机已运行的 Clash Verge App。

默认代理端口是 `33331`，可用 `VERGE_REMOTE_PORT` 覆盖。代理只在 Vite dev server 中生效，不改变生产构建。
