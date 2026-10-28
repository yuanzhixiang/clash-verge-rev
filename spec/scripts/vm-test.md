# vm-test.mjs：虚拟机端到端测试

## 功能定位

在一次性的 Tart macOS 虚拟机里安装正式构建和 `vergectl`，自动验证会改动系统网络的功能和 Surge 桥接，测完销毁虚拟机。本机网络、本机正式版始终不受影响。

不加进 `package.json`（那是 upstream 文件），直接运行：`node scripts/vm-test.mjs [--skip-build] [--keep] [--show]`。

## 环境

| 项 | 口径 |
|---|---|
| 虚拟化 | Tart（Apple Virtualization.framework），仅支持 Apple Silicon macOS 宿主 |
| 基础虚拟机 | 默认 `verge-base`，由 `ghcr.io/cirruslabs/macos-tahoe-vanilla:26.6.2` 克隆，与开发机系统版本一致；可用 `VERGE_VM_BASE` 覆盖 |
| 存储 | `~/.tart`（内置盘），实际占用约 30GB；每次测试的临时机是 APFS 克隆，只占增量 |
| 登录 | vanilla 镜像没有 Tart guest agent，经 SSH 控制，账号是镜像公开的测试账号 `admin/admin`（可用 `VERGE_VM_USER` / `VERGE_VM_PASSWORD` 覆盖），只在本机 NAT 网段可达 |
| 依赖 | `tart`、`sshpass` |

## 流程

1. 校验宿主平台、依赖和基础虚拟机。
2. 构建：`pnpm tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`（upstream 开着 updater 签名产物，本地没有私钥，用 `--config` 关掉，不改 `tauri.conf.json`），再用 `cargo build --release` 构建 `vergectl`。`--skip-build` 复用已有产物。
3. 克隆 `verge-test-<时间戳>` 并启动。`.app` 所在目录和 `vergectl` 所在目录只读挂载到 `/Volumes/My Shared Files/{bundle,cli}`。默认无界面，`--show` 打开虚拟机窗口。
4. 拷贝 `.app` 到 `/Applications`，`vergectl` 装到 `/usr/local/bin`。
5. 用 root 运行打包内的 `clash-verge-service-install --prepare-install --gid <gid> --prompt vm-test --core verge-mihomo <path> --core verge-mihomo-alpha <path>` 安装系统服务。参数与应用自身调用 `clash_verge_service_ipc::management::install` 的一致；以 root 运行时它直接安装，不弹 osascript 密码框。
6. 宿主有 `~/Library/Mobile Documents/iCloud~com~nssurge~inc/Documents/Default.conf` 时，用 scp 拷到虚拟机同一路径。
7. `open` 启动应用，等 `vergectl status` 的 `running_mode` 不再是 `NotRunning`。
8. 依次跑测试用例；单个用例失败不中断后面的用例。
9. 拷回虚拟机里的应用日志，销毁虚拟机。`--keep` 时保留虚拟机，并在退出测试之后重新打开应用，留给人工查看。Ctrl-C 同样会销毁虚拟机。
10. 报告写到 `target/vm-test/<时间戳>/report.json`，日志在同目录的 `guest-logs/`。任一用例失败或流程中断时，退出码为 1。

## 测试用例

网络状态用虚拟机里的 `scutil --proxy`、`networksetup -getdnsservers Ethernet`、`route -n get 1.1.1.1` 判断。所有操作都经 `vergectl` 调用应用后端完成。

| 用例 | 通过条件 |
|---|---|
| service available | `vergectl service` 返回 `available: true` |
| enable system proxy | 系统 HTTP 代理指向实际混合端口，经代理访问 `https://www.apple.com` 返回 200 |
| disable system proxy | HTTP 和 HTTPS 系统代理都关闭 |
| enable TUN | 到 `1.1.1.1` 的路由走 `utun*`，直接访问返回 200 |
| disable TUN restores route and DNS | 路由网卡和系统 DNS 都回到测试前的基线 |
| surge profile converted | `vergectl surge` 有转换时间，节点、分组、规则数都大于 0，无错误 |
| surge import activates subscription | `vergectl surge import` 之后，当前订阅的 URL 等于桥接订阅地址 |
| surge groups loaded with members | mihomo 里 Selector 分组数不少于转换出的分组数，且每组都有成员（含 `policy-path` 远程节点） |
| traffic flows through Surge rules | 经混合端口访问 `https://www.apple.com` 返回 200 或 30x |
| editing Default.conf refreshes the subscription | 往文件末尾追加一行注释后，转换时间更新，日志出现 `refreshed 1 subscription` |
| exit with system proxy on leaves network clean | 开着系统代理时 `vergectl app exit`，进程退出后系统代理关闭，DNS 和路由回到基线 |

宿主没有 `Default.conf` 时，Surge 相关用例跳过。

## 已知限制

- 服务安装绕过了应用的管理员密码弹窗，弹窗本身不在测试范围内。
- 虚拟机出网经过宿主 NAT。宿主开着 TUN 时，虚拟机流量会再被宿主接管；这会影响请求成功与否，但不影响虚拟机内代理、路由、DNS 的断言。
- Surge 用例使用真实节点和远程列表，结果依赖这些外部地址可访问。
- Apple 许可限制同时最多运行 2 台 macOS 虚拟机。
- 偶发：刚启动的虚拟机里，服务清理上一任代理设置时可能碰到 `SystemConfiguration lock preferences (status 3002)`（`kSCStatusPrefsBusy`，系统网络偏好被占用），内核启动失败，表现为「core did not start」。这是 upstream 服务启动时没有重试造成的，重跑一次即可。2026-10-28 的 4 轮测试中出现过 1 次。
