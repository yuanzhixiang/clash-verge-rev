# 规则表单字段

## 组件职责

共享新增与编辑弹窗的规则类型、规则内容、代理策略和 no-resolve 字段，保证两种模式的校验、Autocomplete 和条件字段一致。

## Props 与交互

- 接收受控的 Rule Type、Rule Content、Proxy Policy、no-resolve，以及策略、RULE-SET、SUB-RULE 选项。
- Type 使用不可清空、不可自由输入的 Autocomplete；切换 Type 时清空内容并关闭 no-resolve。
- RULE-SET、SUB-RULE 使用可输入 Autocomplete，其余内容使用 TextField；MATCH 隐藏内容字段。
- Proxy Policy 保持现有 freeSolo 行为；所有字段支持主题焦点态和键盘操作。
- 当 Type 为 `DOMAIN` 或 `DOMAIN-SUFFIX` 时，Rule Content 粘贴单个 URL 或带路径域名会即时替换为可注册主域名；其它类型和普通键盘输入不归一化。
- 同时识别 paste 事件和 WebView 的 `insertFromPaste` 输入事件；仅在一次性插入内容可解析为域名时转换，兼容不同浏览器粘贴实现。

## 边界状态

- 首个浮动标签必须保留安全顶部空间。
- 长选项在 Popper 内滚动，light/dark 与窄屏行为和现有新增弹窗一致。
- 域名粘贴解析失败、多行、IP、localhost、通配符或无法取得主域名时不得阻止默认粘贴。
- 主域名计算必须支持公共及私有后缀；实际子域统一收束，`www` 不保留。
