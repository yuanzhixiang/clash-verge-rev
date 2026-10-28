# vm-test.mjs（pnpm test:vm）：虚拟机端到端测试

## 功能定位

`pnpm dev` 在 `verge-dev` 构建下把系统代理、系统 DNS、系统服务全部 no-op，因此这些会改动系统网络的功能只能用正式构建验证。`test:vm` 把正式构建装进一台一次性 macOS 虚拟机，由脚本（或 agent）自动跑完断言，测完销毁虚拟机。本机网络、本机正式版始终不受影响。

## 环境

| 项 | 口径 |
|---|---|
| 虚拟化 | Tart（Apple Virtualization.framework），只支持 Apple Silicon macOS 宿主 |
| 基础虚拟机 | 默认 `verge-base`，由 `ghcr.io/cirruslabs/macos-tahoe-vanilla:26.6.2` 克隆，与开发机系统版本一致；`VERGE_VM_BASE` 可覆盖 |
| 存储 | `~/.tart`（内置盘）。镜像约 24GB 下载，实际占用约 30GB；每次测试的临时机是 APFS 克隆，只占增量 |
| 登录 | vanilla 镜像不带 Tart guest agent，`tart exec` 不可用；脚本经 SSH 控制，账号为镜像公开的测试账号 `admin/admin`（`VERGE_VM_USER` / `VERGE_VM_PASSWORD` 可覆盖），虚拟机只在本机 NAT 网段可达 |
| 依赖 | `tart`、`sshpass` |

## 流程

1. 校验宿主平台、依赖和基础虚拟机存在。
2. `pnpm tauri build --bundles app` 构建正式版 `.app`（不打 dmg）；`--skip-build` 复用 `target/release/bundle/macos/Clash Verge.app`。
3. 从基础虚拟机克隆 `verge-test-<时间戳>`，`tart run --no-graphics` 启动，并把 bundle 目录只读挂载到虚拟机 `/Volumes/My Shared Files/bundle`。
4. 拷贝 `.app` 到虚拟机 `/Applications`，清除扩展属性。
5. 用 `sudo CLASH_VERGE_SERVICE_GID=<gid> .../Contents/Resources/resources/clash-verge-service-install` 安装系统服务。这与应用自身 `install_service()` 执行的命令一致，只是绕过了 osascript 管理员密码弹窗。安装后等到 `/tmp/verge/clash-verge-service.sock` 出现再继续。
6. `open` 启动应用，等待 `vergectl status` 可达，再等到 `running_mode` 不再是 `NotRunning`，即内核真正跑起来。
7. 如果应用日志出现「服务需要重装」，立即中止。这说明内置服务二进制的版本与应用编译时的 `clash_verge_service_ipc` 不一致，应用会去弹管理员密码框重装，无人值守下会一直卡住。
8. 依次执行测试用例（见下），单个用例失败不中断后续用例。
9. 拷回虚拟机内的应用日志，销毁虚拟机（`--keep` 时保留并打印删除命令）。Ctrl-C 同样会销毁。
10. 报告写到 `target/vm-test/<时间戳>/report.json`，日志在同目录 `guest-logs/`。任一用例失败或流程中断时退出码为 1。

## 测试用例

所有配置变更都经 `vergectl config patch verge` 走应用后端，与用户在界面上操作触发的副作用一致。网络状态用虚拟机内的 `scutil --proxy`、`networksetup -getdnsservers Ethernet` 和 `route -n get 1.1.1.1` 判断。

| 用例 | 通过条件 |
|---|---|
| app reachable via vergectl | `vergectl status --json` 返回 JSON |
| service available | `vergectl service status` 返回 `available: true` |
| enable system proxy | 系统 HTTP 代理指向 `verge_mixed_port`，经代理请求 `https://www.apple.com` 返回 200 |
| disable system proxy | HTTP / HTTPS 系统代理均关闭 |
| enable TUN | 到 `1.1.1.1` 的路由走 `utun*`，直连请求返回 200 |
| TUN sets system DNS | macOS 上开启 TUN 后系统 DNS 为 `114.114.114.114`（`enhance/tun.rs`） |
| disable TUN restores route and DNS | 路由网卡与系统 DNS 都回到测试前的基线 |
| exit with system proxy on leaves network clean | 开着系统代理时 `vergectl app exit`，进程退出后系统代理关闭、DNS 和路由回到基线 |

## 已知限制

- 服务二进制版本必须与 `src-tauri/Cargo.toml` 里 `clash_verge_service_ipc` 的版本一致。`scripts/prebuild.mjs` 下载的是 service-ipc 仓库的 latest release，且文件已存在时跳过下载，两者都可能造成不一致；不一致时测试在启动阶段中止。

- 服务安装绕过了 osascript 管理员弹窗，弹窗本身（文案、取消、密码错误）不在自动测试范围内。
- 虚拟机出网经过宿主 NAT。宿主开着 TUN 时，虚拟机流量会再被宿主接管；请求成功与否会受宿主代理影响，但虚拟机内的代理、路由、DNS 断言不受影响。
- 只覆盖无订阅的默认配置（规则为空时直连），不测试具体节点和规则匹配。
- 一次只跑一台临时机。Apple 许可限制同时最多 2 台 macOS 虚拟机。
