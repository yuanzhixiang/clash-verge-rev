# Fork 维护说明

## 定位

本仓库 `main` 分支 = upstream（clash-verge-rev/clash-verge-rev 的 `dev`）+ 两个 fork 专属功能：

1. **Surge 配置桥接**：直接读取 iCloud 里的 Surge `Default.conf`，实时转换成 mihomo 配置，作为 Clash Verge 的普通订阅使用。见 `spec/src-tauri/src/fork/README.md`。
2. **CLI 控制**：`vergectl` 命令行控制正在运行的 Clash Verge。见 `spec/crates/vergectl/README.md`。

`spec/` 只记录 fork 新增的代码，upstream 的代码不在这里写规格。

## 与 upstream 的接触面

fork 代码全部放在新增文件里，对 upstream 文件的改动只有挂载点（每处一行 import 加一行调用或 JSX）：

| 文件 | 改动 |
|---|---|
| `src-tauri/src/lib.rs` | `mod fork;` 与 `.plugin(fork::init())` |
| `src/pages/settings.tsx` | 引入并在左栏「Clash 设置」下方渲染 `<SurgeBridgeSetting />` |
| `src/pages/rules.tsx` | 页头 `<ProviderButton />` 前渲染 `<SurgeRuleButton />` |
| `src/components/connection/connection-detail.tsx` | 连接详情「关闭连接」按钮上方渲染 `<SurgeRuleAction connection={data} />` |

刻意避免的接触点（不要为了方便去改）：

- 根 `Cargo.toml` workspace 成员：`vergectl` 用自带 `[workspace]` 的独立 crate，转换逻辑放在 `src-tauri/src/fork/` 模块里而不是新 crate。
- `src-tauri/src/utils/server.rs`、`ipc.rs`、capabilities：fork 自己起本地 HTTP 服务，前端直接 `fetch`，不注册 Tauri 命令、不改权限文件。
- `src/locales/*`：前端文案放在组件自己的中英文字典里。
- `tauri.conf.json`：构建时用 `--config` 覆盖需要的项（例如关闭 updater 签名产物）。

## 同步 upstream

```bash
git fetch upstream
git merge upstream/dev   # 冲突只可能出现在上面这些挂载点附近
```

合并后验证：`cargo clippy -p clash-verge --lib --tests`、`cargo test -p clash-verge --lib fork::`、`pnpm typecheck`、`node scripts/vm-test.mjs`。

## 历史

- 2026-10-28：放弃原 fork（UI 全量迁移 shadcn/Tailwind、Surge 风格代理页等，与 upstream 冲突面过大），归档为 `archive/fork-2026-10`，以 upstream 最新代码重开 `main`，只保留上述两个功能。原 fork 的 Surge 节点解析代码迁移复用到 `src-tauri/src/fork/surge/`。
