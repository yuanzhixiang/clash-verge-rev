# fork 插件（Surge 桥接 + 控制 API）

## 职责

`src-tauri/src/fork/` 是一个进程内 Tauri 插件（`tauri::plugin::Builder::new("verge-fork")`），随 Clash Verge 启动、随其退出，不需要单独维护后台服务。它做三件事：

1. 把 Surge 配置文件实时转换成 mihomo 配置，通过本地 HTTP 作为订阅提供给 Clash Verge。
2. 监听 Surge 文件变化，变化后自动重新转换并刷新指向桥接的订阅。
3. 提供 `/api/*` 控制接口，供 `vergectl` 和设置页「Surge 配置」卡片调用。

## 模块

| 文件 | 职责 |
|---|---|
| `mod.rs` | 插件入口：加载设置、初始化桥接、启动 HTTP 服务和文件监听 |
| `settings.rs` | `fork.json` 读写；固定端口 `33380` |
| `bridge.rs` | 转换状态、远程列表抓取与缓存、文件轮询、刷新订阅 |
| `server.rs` | warp 本地服务、Host 校验、鉴权、CORS |
| `api.rs` | `/api/*` 路由分发 |
| `surge/` | 纯转换逻辑，见下文 |

## 设置与存储

- `<app_home>/fork.json`（macOS：`~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/fork.json`），权限 `0600`：
  - `token`：32 位随机串，首次启动生成。
  - `surge.enabled`：默认 `true`。
  - `surge.path`：默认 `~/Library/Mobile Documents/iCloud~com~nssurge~inc/Documents/Default.conf`。
- 远程列表的最后一份成功结果缓存在 `<app_home>/fork-cache/<id>`。

## HTTP 接口

服务只监听 `127.0.0.1:33380`，端口固定，前端和 CLI 不需要发现机制。端口被占用时只记错误日志，桥接与 CLI 不可用。

### 订阅（给 mihomo / Clash Verge 拉取）

| 路径 | 内容 |
|---|---|
| `GET /surge/<token>/config.yaml` | 当前 Surge 文件转换出的完整 mihomo 配置 |
| `GET /surge/<token>/remote/<id>` | `policy-path` 节点列表、`RULE-SET`/`DOMAIN-SET` 规则集的转换结果 |

- token 放在路径里，其它网页猜不到地址，读不到节点凭据。
- 桥接未启用或文件读不到时返回 502。
- `<id>` 是「类型 + 原始 URL」的 FNV-1a 哈希，重新转换后不变，mihomo 的 provider 缓存不会失效。
- 远程抓取顺序：先直连（不走系统代理），失败再经 mihomo 自己的混合端口（`MixedPort::effective()`）；都失败时返回内存或磁盘里的最后一份成功结果；从未成功过则 502。

### 控制（`/api/*`）

鉴权：请求头 `x-verge-token` 等于 `fork.json` 的 token，或 `Origin` 是 Clash Verge webview（`tauri://localhost`、`http(s)://tauri.localhost`；debug 构建额外允许 `http://localhost:*`）。浏览器无法伪造 Origin，本机其它进程能读 token 文件，二者安全边界相同。对允许的 Origin 返回 CORS 头并处理 `OPTIONS` 预检。

| 方法 路径 | 作用 |
|---|---|
| `GET ping` | 存活与版本 |
| `GET status` | 版本、`running_mode`、服务可用、系统代理/TUN 开关、实际混合端口、出站模式、当前订阅、桥接状态 |
| `GET service` | `{ available, state }`，`available` 即 `RunStateView.service_usable` |
| `GET/POST config/verge` | 读取 / patch `IVerge`（走 `feat::patch_verge`，与界面操作副作用一致） |
| `GET config/clash` | 读取 clash 配置 |
| `GET profiles` | 订阅列表 `{uid,name,type,url,current}` |
| `POST profiles/select {uid}` | 按 uid / 名称 / URL 启用订阅 |
| `POST profiles/update {uid}` | 重新下载订阅 |
| `POST profiles/import {url}` | 导入订阅 |
| `GET/POST mode` | 读取 / 设置出站模式 |
| `GET groups` | mihomo 代理组 |
| `POST groups/select {group,proxy}` | 切换节点（走 `feat::switch_proxy_node`，会持久化选择），切换后回读确认 |
| `POST groups/delay {group}` | 分组测速 |
| `GET surge` | `{enabled, path, subscription_url, status}` |
| `POST surge {enabled?, path?}` | 改设置并立即重新转换 |
| `POST surge/refresh` | 重新转换并刷新所有指向桥接的订阅 |
| `POST surge/import` | 未导入则以订阅形式导入（不经代理下载），然后启用 |
| `GET surge/rules` | `{rules: [{type,value,policy,editable}], policies, kinds}`，按文件顺序列出 `[Rule]`；`policies` 为 `DIRECT`、`REJECT` 加 `[Proxy]`、`[Proxy Group]` 的名字 |
| `POST surge/rules {type?, value, policy}` | 设置一条规则的策略，见「规则编辑」 |
| `POST surge/rules/delete {type?, value}` | 删除同类型同值的所有行 |
| `POST surge/reveal` | 用系统文件管理器打开 Surge 文件所在目录（`open::that`，与 upstream 打开应用目录的方式一致） |
| `POST app/exit` | 退出 Clash Verge |

成功返回 200 + JSON；业务错误返回 400 `{error}`；鉴权失败 401；Host 不是 `127.0.0.1:33380` / `localhost:33380` 返回 403（防 DNS rebinding）。

## 文件监听

每 3 秒对 Surge 文件做一次 `stat`，比较路径、修改时间和大小。iCloud 同步是整文件原子替换，文件事件不可靠，所以用轮询。

- 首次看到某个路径：只转换，不刷新订阅。
- 之后发生变化：转换成功后刷新所有 URL 以 `http://127.0.0.1:33380/surge/<token>/` 开头的订阅（`feat::update_profile`），日志打 `[surge] profile changed, refreshed N subscription(s)`。
- 转换失败：只记日志，保留上一次的订阅内容。

## 规则编辑（`surge/edit.rs`）

给界面和 `vergectl` 用的「这个站走某某策略」，直接改 Surge 文件，Surge 那边看到的也是同一份规则。

- 只支持 `DOMAIN-SUFFIX`（`type` 缺省值）、`DOMAIN`、`DOMAIN-KEYWORD`、`IP-CIDR`、`IP-CIDR6`。其它类型可以列出，但不能在界面里改。值统一转小写，去掉首尾的 `.`；IP 不带前缀时补 `/32` 或 `/128`。
- 新规则插到 `[Rule]` 标题的下一行，优先级最高。已有同类型同值（不区分大小写）的规则时，原地改策略，保留缩进和 `no-resolve` 之类的选项。策略没变就不写文件。
- 按行做文本编辑：其余内容逐字节不变，保留 CRLF。删除时连同换行一起删掉，不留空行。
- 写入时先写同目录下的 `.<文件名>.verge-edit`，再 `rename` 替换，避免读到写了一半的文件。配置的路径是符号链接时，写到它的目标文件。
- 读、改、写都在 `Bridge.seen` 锁内完成，写完后把新的文件状态记进 `seen`，3 秒轮询就不会把同一次修改再处理一遍。随后立即转换，并刷新指向桥接的订阅（mihomo 热重载，内核不重启）。
- 刷新成功后，从 mihomo 拉当前连接，关闭命中规则的连接，让它们按新规则重连：`host` 按域名规则匹配，`destinationIP` 按 CIDR 匹配。已建立的连接不会因为重载而换线路。删除规则后也照此处理。

## Surge → mihomo 转换口径（`surge/`）

| Surge | mihomo |
|---|---|
| `[General] dns-server` | `dns.nameserver`（去掉 `system`） |
| `ipv6` / `loglevel` | `ipv6` / `log-level`（`notify` 映射为 `info`，`verbose` 映射为 `debug`） |
| `skip-proxy`、`block-quic`、`udp-policy-not-supported-behaviour`、`always-real-ip` | 跳过并给出警告。`skip-proxy` 请在 Clash Verge 系统代理的绕过列表里配置 |
| `[Proxy]` ss / anytls / socks5(-tls) / http(s) / trojan / vmess / snell | 对应类型；`underlying-proxy` → `dialer-proxy` |
| `[Proxy]` `direct` / `reject*` 类型 | 作为别名映射到 `DIRECT` / `REJECT` / `REJECT-DROP` |
| `[Proxy Group]` select / url-test / fallback / load-balance | 同名类型；`smart` → url-test，其它 → select（都有警告） |
| `policy-path` | `proxy-providers` `policy-<组名>`，URL 指向本地 `/remote/<id>`，`update-interval` → `interval` |
| `include-all-proxies` / `include-other-group` / `policy-regex-filter` | `include-all-proxies` / 追加到 `proxies` / `filter` |
| `timeout`（秒） | `timeout`（毫秒） |
| `DEST-PORT` / `SRC-IP` / `PROTOCOL,TCP\|UDP` | `DST-PORT` / `SRC-IP-CIDR` / `NETWORK` |
| `PROCESS-NAME` 值含 `/` | 以 `/` 结尾 → `PROCESS-PATH-REGEX,^<转义前缀>`，否则 `PROCESS-PATH` |
| `AND` / `OR` / `NOT` | 同语法，子规则逐个转换；任一子规则不支持则整条跳过 |
| `RULE-SET,<url>` / `DOMAIN-SET,<url>` | `rule-providers` `ruleset-N`（classical / domain，text） |
| `RULE-SET,LAN` | 展开为内网地址段规则（IP 规则带 `no-resolve`） |
| `FINAL` | `MATCH`；缺失时补 `MATCH,DIRECT` 并给警告 |
| `[Host]` `domain = ip/alias` | `hosts`；`server:x` → `dns.nameserver-policy` |
| `[URL Rewrite]`、`[MITM]` 等其它段 | 整段跳过，警告里注明行数 |

不支持的规则类型（`URL-REGEX`、`USER-AGENT`、`PROTOCOL,STUN` 等）跳过并给出警告。规则集内的不支持行直接丢弃，只记日志。警告最多保留 200 条。

只输出订阅层字段（proxies、groups、rules、providers、dns、hosts 等）。端口、external-controller、TUN 这类由 Clash Verge 管理的字段不输出。

## 已知限制

- 端口固定为 33380，被占用时功能不可用。
- 本地 `policy-path` / 本地规则集文件不支持，只支持 http(s) 远程地址。
- Surge 的 MITM、URL Rewrite、脚本等功能 mihomo 没有对应能力，无法迁移。
- Clash Verge 退出后订阅地址不可访问；mihomo 内核也随之停止，不影响使用。
