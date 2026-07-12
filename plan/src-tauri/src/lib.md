# Tauri 应用生命周期

## Safe Dev 启动

- safe-dev 跳过正式单例服务、自动启动插件初始化、深链注册和所有核心/网络后台任务，只初始化日志、隔离的窗口状态与可见主窗口。
- safe-dev 不注册 Mihomo、Service、Updater、HTTP、Shell、FS、Process、全局快捷键或深链插件；仅保留窗口本身不依赖的 Tauri 核心能力和隔离的 window-state 插件。
- safe-dev 不启动嵌入式 CLI server，不暴露第二个可写本地控制端口。
- safe-dev 使用缩减后的空应用 command handler；页面数据由前端只读 bridge 提供，Window/Event 由 Tauri 插件原生处理。
- macOS 窗口焦点和销毁事件不得注册或注销全局热键。

## Safe Dev 退出

- safe-dev 不注册正式退出信号回调；Ctrl-C 由开发启动器终止进程组。
- 窗口关闭、进程 Exit 和 ExitRequested 不调用正式 `quit`/`clean_async`，不保存业务配置，也不操作正式 App、系统代理、DNS、服务或核心。
- macOS WebContent 终止恢复不清理 Mihomo WebSocket；安全窗口只允许自身重载。

## 普通运行

- 非 safe-dev 的插件、command、初始化、单例、托盘、热键、更新和退出清理流程保持现状。
- 规则集合详情注册只读 `get_rule_provider_content` 命令；命令只接收 provider 名称，路径解析和安全边界由后端模块负责。
- Profiles 注册 `reveal_profile_file` 命令；命令只接收 Profile UID 或固定扩展标识，由后端解析实际文件并在系统文件管理器中定位。
