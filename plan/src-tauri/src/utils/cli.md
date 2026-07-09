# CLI 本机接口

`src-tauri/src/utils/cli.rs` 承担 `POST /commands/cli` 的请求分发。该接口挂在现有 embedded server 下，只绑定 `127.0.0.1`，供本机 `vergectl` 调用。

## 请求与响应

- 请求体使用 JSON，`cmd` 为 snake_case 命令名。
- 响应统一为 `{ ok: true, data }` 或 `{ ok: false, error }`。
- 请求体限制为 1MB，主要用于配置 patch 文件。

## 核心处理流程

- `status`、`paths` 只读当前内存态和路径。
- `config_get` 读取 `Config::verge`、`Config::clash` 或 `Config::runtime`，按 JSON/YAML 返回。
- `config_patch` 复用 `feat::patch_verge` 和 `feat::patch_clash`，让系统代理、TUN、runtime 更新、核心重载等副作用仍由既有流程处理。
- `logs` 优先读取内存中的 core logs，缺失时回退日志文件。
- `core` 复用现有 `start_core`、`stop_core`、`restart_core` 命令。
- `backup_create` 复用本地备份生成逻辑。

## 非目标

- 不暴露 profiles、proxies、rules、unlock、restore 等完整 UI 能力。
- 不提供远程访问、token 管理或多租户鉴权。
- 不允许 CLI 直接写配置文件绕过运行态。

