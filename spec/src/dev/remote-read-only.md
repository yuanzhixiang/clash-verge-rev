# 远程只读命令白名单

## 模块职责

`remote-read-only` 定义安全开发模式可转发给正式 Clash Verge CLI 的读取命令。前端 bridge 与 Vite 服务端 relay 共同使用同一个判定函数，避免两层安全边界出现口径漂移。

## 白名单口径

- 只允许应用状态、路径、配置读取、日志读取，以及 Profiles、Rules、Connections、Proxies、运行时配置、系统状态和备份列表的查询 action。
- 系统代理、TUN、DNS 写入、Profile/规则修改、节点选择、连接关闭、Provider 更新、核心/服务控制和备份写入不在白名单内。
- 命令与 action 均采用默认拒绝；新增 CLI command 不会自动获得 Safe Dev 权限，必须先明确评估并更新本规格和实现。
- 拒绝错误统一带 `[Safe Dev] read-only mode blocked` 前缀，便于 UI、日志和测试识别。

## 组合关系

- `remote-tauri-bridge` 在 invoke 映射和实际 fetch 前各执行一次校验。
- `vite.config` 的安全 relay 在跨进程转发前再次执行相同校验；即使页面绕开 bridge 直接 POST，也不能扩大权限。
- 普通 `web:remote` 没有开启 Safe Dev 只读环境变量时，不经过此服务端限制，保持既有开发行为。
