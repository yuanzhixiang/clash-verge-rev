# SurgeBridgeSetting

## 职责

设置页右栏最下方的「Surge 配置」卡片：开关桥接、选择 Surge 文件、查看转换结果和警告、一键把桥接添加为订阅并启用、手动重新转换。由 `src/pages/settings.tsx` 以一行 `<SurgeBridgeSetting onError={onError} />` 接入。

## 数据来源

- 直接 `fetch('http://127.0.0.1:33380/api/...')`。upstream 的 CSP 为 `null`，webview 的 Origin 用于鉴权（见 `spec/src-tauri/src/fork/README.md`），不走 Tauri IPC，所以不改 `ipc.rs` 和 capabilities。
- 挂载时以及之后每 5 秒拉一次 `GET surge` 和 `GET profiles`，这样文件变化后自动转换的结果能及时显示。
- 订阅状态：在 `profiles` 里找 `url === subscription_url` 的项，`current` 决定是「已启用」「已添加，未启用」还是「未添加」。

## 视觉与交互

外层 `Box` 与设置页其它卡片一致：圆角 2，深色 `#282a36`，浅色 `#ffffff`，顶部间距 1.5。内部使用 upstream 的 `SettingList` / `SettingItem` / `Switch`，MUI 风格与其它设置项统一。

| 行 | 交互 |
|---|---|
| 使用 Surge 配置 | 开关，`POST surge {enabled}` |
| 配置文件 | 副标题显示完整路径；「更换」打开系统文件选择框（只列 `.conf`），选中后 `POST surge {path}` |
| 转换状态 | 「N 个节点 · N 个分组 · N 条规则 · 时间」；出错时显示错误信息；未启用时显示「未启用」 |
| 转换提示（N） | 点击展开或收起警告列表，没有警告时显示「无」 |
| 订阅 | 未启用时显示「添加并启用」或「启用」按钮，`POST surge/import`，成功后弹出提示 |
| 立即重新转换并刷新订阅 | 可点击行，执行时显示加载圈，`POST surge/refresh`，成功后提示刷新了几个订阅 |

- 桥接不可达（插件未启动或端口被占用）：状态行显示「无法连接 Surge 桥接服务」，开关和按钮禁用。
- 操作失败：错误交给页面的 `onError`，用 upstream 的通知显示。
- 所有操作用 `useLockFn` 串行执行，避免重复点击。

## 文案

组件内置 `zh` / `en` 两套文案，`i18n.language` 以 `zh` 开头时用中文，否则用英文。不往 `src/locales` 加 key，因为 upstream 的 i18n key 有生成的类型约束，而且 locale 文件改动频繁，容易冲突。
