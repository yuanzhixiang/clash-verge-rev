# CLI 安装能力

`src-tauri/src/feat/cli.rs` 负责把打包随附的 `vergectl` sidecar 安装到用户级 bin 目录，并给设置页返回安装状态。

## 安装位置

- macOS/Linux：`${XDG_BIN_HOME:-~/.local/bin}/vergectl`。
- Windows：`%LOCALAPPDATA%/Clash Verge/bin/vergectl.exe`，安装时把该目录加入 User PATH。

## 状态口径

- `installed` 表示目标路径存在可执行文件。
- `versionMatches` 通过比较打包 sidecar 和已安装文件内容判断；如果 sidecar 不存在则为 false。
- `path` 是最终命令路径，`installDir` 是用户级 bin 目录，`sourcePath` 是当前找到的 sidecar 路径。

## 边界情况

- 开发环境未运行 `prebuild` 时，安装会提示缺少 `vergectl-${target}` sidecar。
- 卸载只移除 `vergectl` 文件，不删除用户 bin 目录，也不清理用户可能手动维护的 PATH。

