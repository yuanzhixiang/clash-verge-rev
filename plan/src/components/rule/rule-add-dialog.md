# 新增规则弹窗

## 组件职责

新增规则弹窗收集一条规则的类型、条件、策略、解析选项和插入位置，校验后把标准规则字符串交给规则页保存。

## 使用场景

- 规则页底部操作栏点击加号。

## Props 与数据输入

- `open / onClose / onSubmit / submitting` 控制弹窗生命周期和保存状态。
- `policyOptions / ruleSetOptions / subRuleOptions / existingRules` 来自当前运行配置。
- 新增模式每次挂载时默认选择 `DOMAIN-SUFFIX`，不依赖规则类型数组顺序；编辑弹窗不使用该默认值。

## 视觉状态

- 使用紧凑单列表单、主题表面、hairline 边框和 8px 控件圆角。
- 表单内容区必须为首个浮动标签预留安全顶部间距，Rule Type 标签不得被内容区滚动边界或描边裁切。
- Rule Type 与 Proxy Policy 使用相同的 Autocomplete、Popper 定位、输入框宽度和主题表面；弹层由 MUI 自动处理视口防溢出及内部滚动。
- 默认位置为顶部，位置选项明确显示顶部与底部含义。

## 交互状态

- Type 可通过点击或输入关键词过滤合法规则类型；改变后切换条件输入、RULE-SET、SUB-RULE 和 no-resolve 控件，并清空 Rule Content、关闭 no-resolve。
- Rule Type 弹层从输入框下方展开，定位、宽度和滚动行为以 Proxy Policy 为基准，不得覆盖输入框本身。
- 保存时校验必填项、类型专用格式和重复规则；成功提交标准字符串与 prepend/append 位置。
- 提交期间禁用关闭以外的重复保存操作，并显示明确加载状态。

## 键盘、Hover、Focus、Disabled 与 Loading

- 所有字段、取消和保存按钮可通过键盘访问并显示主题焦点环。
- 初始焦点落在 Type；Enter 不得绕过校验。
- Rule Type 支持输入过滤、方向键导航、Enter 选择和 Escape 关闭；Space 作为正常搜索输入，关闭弹层后焦点返回输入框。
- 保存和取消按钮在提交中 disabled，避免异步保存期间关闭弹窗造成状态泄漏。

## 边界状态

- MATCH 等无条件类型隐藏 Value。
- Rule Type 只能从 `RULE_DEFINITIONS` 选择，不允许自由输入或清空，始终保持可序列化的合法类型。
- 无可用代理组时仍保留 DIRECT、REJECT、REJECT-DROP、PASS。
- 完全相同的运行时规则禁止重复新增。
- 窄窗口和极端低高度下由 MUI 自动调整弹层防溢出位置和可滚动高度。

## 组合关系

- 规则定义、校验和序列化复用 `rule-config`，与 Profile 规则编辑器保持一致。
- 组件不直接读写 Profile 文件，保存副作用由规则页完成。
