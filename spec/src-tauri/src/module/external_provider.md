# 外部节点列表 provider 适配层（Surge policy-path 对应能力）

## 功能定位

让应用原生订阅 Surge policy-path 风格的外部节点列表：profile 中用 fork 私有字段声明的 proxy-provider 在配置增强阶段被拦截，拉取、转换并重写为内核可识别的 file provider。内核与验证器永远看不到私有字段。

## 声明口径

```yaml
proxy-providers:
  self:
    type: http
    url: https://example.com/surge-node-list.conf
    verge-format: surge   # fork 私有标记，触发适配
    interval: 3600        # 秒，0 = 不自动更新，缺省 3600
    ua: my-agent          # 可选，覆盖默认 User-Agent
    filter: HK            # 其余 mihomo provider 字段原样透传
```

- 组通过 `use: [self]` 引用；provider 节点自然不出现在策略页 Proxy 区。
- 用 `verge-format` 而非 `format`，规避 mihomo 未来给 provider 增加 `format` 字段的撞名风险。

## 内容识别与转换（crates/clash-verge-surge）

- 拉取内容自动识别：YAML 且含 `proxies:` 数组 → 直接抽取（面板订阅 UA 协商返回 Clash 格式的场景）；否则按 Surge 节点行列表解析。
- Surge 行格式 `名字 = 类型, server, port, k=v...`，双引号内逗号不分隔；空行、`#`/`;`/`//` 注释、`[Section]` 头忽略。
- 支持协议映射：ss（encrypt-method→cipher、obfs→plugin/plugin-opts）、anytls、socks5 / socks5-tls、trojan（ws→network/ws-opts）、vmess（username→uuid、vmess-aead→alterId 0/1、sni→servername、缺省 cipher auto / alterId 0）、http / https、snell；通用参数 udp-relay→udp、underlying-proxy→dialer-proxy、skip-cert-verify、tfo、server-cert-fingerprint-sha256→fingerprint、ip-version（Surge 值映射 mihomo 值）。
- 坏行/不支持协议记入 skipped（行号 + 原因），不中断整表；整表 0 个可用节点视为 provider 级失败。

## 增强管线行为（src-tauri/src/module/external_provider.rs）

- 插入点：`enhance()` 中 `ensure_lan_bind_address` 之后、`cleanup_proxy_groups` 之前（后者负责在 provider 被移除时自动清理组内 `use:` 引用）。
- 每次 enhance：
  1. 收集带 `verge-format: surge` 的 provider 声明；声明非法（缺 url、interval 非数字）→ 移除该条目并通知。
  2. 缓存文件缺失时同步拉取转换（20s 超时，直连失败后走自身代理重试）；失败 → 移除条目 + 通知，enhance 不整体失败。
  3. 重写条目：剥离 url/interval/verge-format/ua，改为 `type: file, path: providers/verge-ext-<sanitized>-<hash8>.yaml`（正斜杠相对路径，位于 mihomo home 内满足 safe-path）；未声明 health-check 时注入默认块（cp.cloudflare.com/generate_204、300s、lazy）；其余字段透传。
  4. 重建全局注册表并惰性启动调度循环。
- 缓存文件：`providers/` 目录下 `verge-ext-` 前缀 + 名字 ASCII 化 + URL 哈希 8 位；原子写入（临时文件 + rename），文件头注释记录来源 URL。
- 孤儿清理：注册表键集变化时，删除既不在注册表、也不被已生效运行时配置引用的 `verge-ext-*.yaml`（保护验证失败回滚期间内核仍引用的旧文件）。

## 更新机制

- 定时：60s tick 的调度循环，按缓存文件 mtime 判断是否超过 `interval`（跨重启有效）；到期后重新拉取写文件，再通过 mihomo `PUT /providers/proxies/:name` 让内核重读，并刷新前端。
- 手动：`update_proxy_provider_ex(name)` 命令（src-tauri/src/cmd/external_provider.rs）——外部 provider 先重拉取转换写文件再 PUT；普通 provider 直接透传 PUT。前端 Provider 按钮（单个/全部更新）统一走该命令。
- `get_external_proxy_providers()` 返回托管中的 provider 名单，前端可选用。

## 错误处理与日志

- skipped 行逐条 warn 日志（Type::Config）；provider 级失败 error 日志 + `notice_message` 弹通知。
- 拉取失败但缓存文件仍在：继续用旧缓存，不移除 provider。
- 已知限制：`-t` 验证 profile 原文件时 mihomo 按普通 http provider 解析该条目（未知键被忽略），不会实际拉取。

## 安全约束

- 转换库（crates/clash-verge-surge）无 IO、无应用依赖，纯函数可单测。
- 缓存路径始终位于 app home 的 `providers/` 内，不接受声明方控制的路径。
