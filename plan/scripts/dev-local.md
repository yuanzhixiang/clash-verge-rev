# dev-local.mjs（pnpm dev）：隔离的本地开发环境

## 功能定位

`pnpm dev` 启动与正式版完全隔离的完整开发实例，用于本地功能与规则测试；保证开发实例**绝不影响本机网络环境和正在运行的正式版应用**。

## 隔离机制

| 维度 | 正式版 | dev 实例 | 实现位置 |
|---|---|---|---|
| 配置目录 | `.../io.github.clash-verge-rev.clash-verge-rev` | 同路径 `.dev` 后缀 | dirs.rs APP_ID（verge-dev feature） |
| mihomo IPC | `/tmp/verge/verge-mihomo.sock` | `/tmp/verge-dev/verge-mihomo.sock` | dirs.rs ipc_path verge-dev 分支 |
| embed/CLI 端口 | 33331 | 11233 | constants.rs |
| 内核端口 | 订阅决定（7890 等） | mixed 7900 / socks 7901 / http 7902 | 播种时 patch verge.yaml + clash-verge.yaml（app 权威字段覆盖 profile 值） |
| 系统代理 | 正常管理 | **全部 no-op + 日志**（含启动时的强制清理） | sysopt.rs `skip_in_dev`（cfg verge-dev） |
| 系统 DNS | set/unset_dns.sh | **全部 no-op + 日志** | resolve/dns.rs `skip_in_dev` |

## 播种行为

- dev 配置目录不存在时，从正式版目录拷贝：profiles.yaml、profiles/、verge.yaml、clash-verge.yaml、dns_config.yaml、geodata（Country.mmdb、geoip.dat、geosite.dat）；不拷 cache.db、日志、备份。
- 拷贝后强制 patch dev 配置：`enable_system_proxy/tun/auto_launch/proxy_guard/external_controller/silent_start = false`，端口改写为 dev 端口，`allow-lan: false`。
- `pnpm dev --reset`：把现有 dev 目录改名备份为 `.bak-<时间戳>` 后重新播种。
- 目录已存在则跳过播种直接启动（dev 内的改动会保留）。
- `VERGE_DEV_MIXED_PORT` 可覆盖起始端口（socks/http 依次 +1/+2）。

## 命令关系

- `pnpm dev` → 本脚本（隔离完整应用）。
- `pnpm dev:remote` → 原只读远程窗口（dev-safe.mjs，要求正式版在跑）；`dev:diff` 指向它。
- `pnpm dev:unsafe` / `dev:trace` 保留：同为 verge-dev feature，受益于 IPC 与系统网络隔离，但不做播种。
- `pnpm dev:chrome` → 见 dev-chrome.md。

## 已知限制

- verge-dev 构建下无法测试"系统代理开关 / 系统 DNS 设置"功能本身（被全局 no-op）；需要测这些时用正式打包版。
- TUN 模式在 dev 中同样不可用（开关被播种为 false，系统层操作被跳过）。
