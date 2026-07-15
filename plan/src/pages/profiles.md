# Profiles 页面

## 页面定位

Profiles 用于导入、创建、激活、更新、排序和维护 Clash 配置文件，并提供全局 Merge 与 Script 扩展入口。页面采用与 Rules 一致的紧凑桌面工具布局，不以宽松卡片表达配置。

## 用户流程

- 用户可在顶部粘贴订阅地址并导入，或新建本地配置。
- 普通 Profile 集中显示在单一列表中；点击行激活，拖拽手柄调整顺序，刷新按钮更新远程订阅，更多菜单进入编辑、打开、定位和删除等操作。
- 批量模式沿用顶部入口，支持全选、取消选择和批量删除。
- 页面底部的 Extensions 列表维护 Global Extend Config 与 Global Extend Script。

## 信息架构

- 页头：标题以及批量、全部更新、运行时配置和重新增强等既有工具。
- 导入工具栏：URL 输入框、Import、New。
- Profiles 列表：名称、实际加载文件名、来源或描述、更新时间、用量与到期信息、行级刷新和更多菜单。主 Profile 存在同 stem `.conf` 时显示 CONF Override 标签。
- Extensions 次级列表：Global Merge 与 Global Script，行结构和操作入口与普通 Profile 保持一致。

## 主要交互

- 当前 Profile 使用柔和中性背景和细微结构提示，不改变名称字重或使用高饱和蓝色。
- 更多按钮与右键菜单提供相同操作；Open File 使用默认应用打开文件，Reveal in Finder 在文件管理器中定位文件，两者语义独立。
- local/remote 主 Profile 的更多/右键菜单在“编辑文件”后提供 CONF 转换。首次转换直接从声明 YAML 生成 sibling CONF；已有 CONF Override 时改为“从 YAML 重新生成 CONF”，确认后才允许覆盖。
- 当前 Profile 转换成功后立即强制增强并刷新 Mihomo；若校验或应用失败，首次转换删除新 CONF，覆盖转换恢复旧 CONF，并恢复原运行配置。非当前 Profile 仅生成文件并刷新列表。
- 拖拽、激活、更新队列、编辑器、增强配置、脚本日志与批量逻辑保持原有行为。
- local/remote 主 Profile 的声明文件保持 YAML；同目录存在同 stem CONF 时，读取、编辑、打开和定位均以 CONF 为准。CONF 解析失败必须阻止加载，不得静默回退 YAML。遗留 TOML 完全忽略。
- 远程 Profile 刷新仍只更新声明 YAML。存在 CONF Override 时刷新成功后提示 YAML 已更新但尚未生效，当前继续使用 CONF。
- 页面不新增筛选、分页或服务端排序；普通 Profile 顺序来自既有配置并可拖拽调整。

## 状态与反馈

- 激活中显示行内遮罩和进度；远程更新中仅禁用并旋转对应刷新按钮。
- 列表读取沿用 Profiles 数据查询的加载、过期和错误恢复机制；数据异常时保留页头紧急刷新入口。
- 没有普通 Profile 时列表容器允许为空，Extensions 仍可访问。
- 操作错误继续通过全局通知反馈，不在列表中复制错误面板。
- CONF 转换期间使用对应 Profile 行的 loading 状态防止重复操作；成功通知包含目标文件、是否覆盖，以及当前配置是否已应用。
- CONF 语法、未知段落、嵌套值或结构错误必须指出文件、行号及原因。

## 权限与安全

- 页面不接收任意文件路径。文件打开和定位都只向后端传入 Profile UID 或固定的 `Merge`、`Script` 标识。
- 远程只读开发模式不得执行真实文件管理器副作用。

## 响应式行为

- 宽屏下导入输入框与按钮保持同一行，控件高 38px。
- 空间不足时输入框先占满一行，Import 与 New 自然换行；内容区使用剩余高度滚动，不依赖固定工具栏高度。
- 小窗口隐藏用量、到期和更新时间等次要元数据；名称、选择、拖拽、刷新和更多菜单始终可达。

## 文案口径

- 普通配置区使用页面标题 `Profiles`，扩展区标题使用本地化 `Extensions`。
- macOS 显示 `Reveal in Finder`；其他平台使用对应的文件管理器定位语义。
- Profile 名称是用户可读名称，不等同于磁盘文件名；列表必须同时展示当前实际加载文件。CONF Override 表示同 stem CONF 正在覆盖声明 YAML，删除 CONF 后自动恢复 YAML。

## 可访问性与 UI 约束

- 图标按钮必须提供本地化 title；菜单可由可见更多按钮或右键打开。
- 键盘批量选择和拖拽继续使用既有 DnD/复选框能力。
- 表面、hairline、焦点色使用现有 shell/theme 变量，兼容 Light、Dark 和自定义主题。
