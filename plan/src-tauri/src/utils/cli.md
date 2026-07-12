# CLI 本机接口

`src-tauri/src/utils/cli.rs` 承担 `POST /commands/cli` 的请求分发。该接口挂在现有 embedded server 下，只绑定 `127.0.0.1`，供本机 `vergectl` 调用。

## 请求与响应

- 请求体使用 JSON，`cmd` 为 snake_case 命令名。
- 响应统一为 `{ ok: true, data }` 或 `{ ok: false, error }`。
- 请求体限制为 1MB，主要用于配置 patch、DNS 配置、profile 文件和 runtime proxy-chain 内容。

## 核心处理流程

- `status`、`paths` 只读当前内存态和路径。
- `config_get` 读取 `Config::verge`、`Config::clash` 或 `Config::runtime`，按 JSON/YAML 返回。
- `config_patch` 复用 `feat::patch_verge` 和 `feat::patch_clash`，让系统代理、TUN、runtime 更新、核心重载等副作用仍由既有流程处理。
- `app` 复用现有 app command；diagnostics 在 CLI 中返回文本内容，方便 agent 消费。
- `system` 和 `service` 复用现有网络、系统代理、自启动和 service command。
- `clash` 复用 Clash command，DNS flow 仍通过独立 DNS 配置文件保存、校验和应用。
- `runtime` 复用 runtime command，proxy-chain 更新仍通过 `CoreManager::update_runtime_config`。
- `profiles` 复用 profiles command 和安全 helper，覆盖导入、创建、更新、删除、重排、patch、读写文件和增强。
- `proxies`、`connections`、`rules` 优先复用 `handle::Handle::mihomo().await` 的现有 API；`rules content` 复用受限的 `get_rule_provider_content` 本地缓存读取命令，不新增远程端口。
- `unlock`、`backup`、`validate` 复用现有 Tauri command/feat 函数。
- `logs` 优先读取内存中的 core logs，缺失时回退日志文件。
- `core` 复用现有 `start_core`、`stop_core`、`restart_core` 命令。

## 非目标

- 不新增 daemon、远程访问、token 管理或多租户鉴权。
- 不允许 CLI 直接写配置文件绕过运行态。
- `watch` 当前由 CLI 轮询后端 JSON 输出，不在 embedded server 上新增流式接口。
