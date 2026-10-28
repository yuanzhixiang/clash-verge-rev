# vergectl

## 定位

命令行控制正在运行的 Clash Verge，面向本人和 agent 使用。所有操作都经 fork 插件的 `/api/*` 接口完成（接口定义见 `spec/src-tauri/src/fork/README.md`），CLI 本身不读写任何配置文件，只读 `fork.json` 里的 token。

## 构建与安装

独立 crate，自带 `[workspace]`，不加入 upstream 的 workspace；唯一依赖是 `serde_json`，HTTP 用标准库 `TcpStream` 手写（`Connection: close`，支持 chunked 响应）。

```bash
cargo build --release --manifest-path crates/vergectl/Cargo.toml
install -m 755 crates/vergectl/target/release/vergectl ~/.local/bin/vergectl
```

不打进 `.app`：打进去需要改 upstream 的 `tauri.conf.json` 的 `externalBin`。

## 连接

- 地址 `127.0.0.1:33380`，可用 `VERGECTL_PORT` 覆盖。
- token 从 `<数据目录>/io.github.clash-verge-rev.clash-verge-rev/fork.json` 读取（macOS：`~/Library/Application Support`；Linux：`$XDG_DATA_HOME` 或 `~/.local/share`；Windows：`%APPDATA%`），可用 `VERGECTL_TOKEN` 覆盖。
- 读超时 120 秒（订阅更新、测速可能较慢）。

## 命令

| 命令 | 接口 |
|---|---|
| `status` | `GET status` |
| `service` | `GET service` |
| `sysproxy on\|off`、`tun on\|off` | `POST config/verge` |
| `mode [rule\|global\|direct]` | `GET/POST mode` |
| `profiles [list]`、`profiles use\|update <uid\|name\|url>`、`profiles import <url>` | `profiles*` |
| `groups [list]` | `GET groups`，精简为 `{name,type,now,members}` |
| `groups select <group> <proxy>`、`groups delay <group>` | `groups/*` |
| `surge [status]`、`surge enable\|disable`、`surge path <file>`、`surge refresh`、`surge import` | `surge*` |
| `config get verge\|clash`、`config patch verge '<json>'` | `config/*` |
| `app exit` | `POST app/exit` |
| `api GET\|POST <path> ['<json>']` | 任意 `/api/<path>`，给新接口留口子 |

## 输出与退出码

- 成功：stdout 输出格式化 JSON，退出码 0。
- 3：参数错误，同时打印用法。
- 2：连不上应用，或读不到 `fork.json`（提示先启动 Clash Verge）。
- 4：接口返回非 2xx，stderr 输出 `HTTP <code>: <error>`。
