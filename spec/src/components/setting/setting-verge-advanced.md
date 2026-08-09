# Verge 高级设置组件

高级设置页集中放置维护类入口，包括备份、配置目录、日志目录、更新检查、开发者工具、轻量模式、诊断信息和版本信息。

## CLI 入口

- 页面加载时读取 `get_cli_install_status`，展示 CLI 目标路径或安装目录。
- 当 CLI 未安装或已安装版本与当前 sidecar 不一致时，按钮文案为安装 CLI，点击会复制当前打包的 `vergectl` 到用户级 bin 目录。
- 当 CLI 已安装且版本一致时，按钮文案为卸载 CLI，点击只移除已安装的 `vergectl` 文件。
- 安装失败通常表示当前构建缺少 sidecar，需要先执行 `pnpm run prebuild <target>`。

## 交互状态

- 复用 `SettingItem` 的异步 loading 状态。
- 成功后显示简短通知并刷新本地状态。
- 状态读取失败不阻塞高级设置页其它能力，只在控制台记录错误。

