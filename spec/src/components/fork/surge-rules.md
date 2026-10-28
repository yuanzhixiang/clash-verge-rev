# SurgeRuleButton / SurgeRuleAction

## 职责

在应用里改 Surge 配置的 `[Rule]` 段，不用开 Surge，也不用手动编辑文件。两个入口共用同一个弹窗：

- `SurgeRuleButton`：规则页页头，`<ProviderButton />` 左边。改完后调用 `refreshRules()` 刷新列表。
- `SurgeRuleAction`：连接详情里「关闭连接」上方，用这条连接的 `host` 预填（没有 host 时用 `destinationIP`）。连接详情是 MUI `Snackbar`，弹窗作为它的 React 子节点渲染，点击弹窗不会触发 Snackbar 的 click-away 关闭。

只有桥接已启用、并且桥接订阅是当前订阅时才渲染（`useSurgeActive`），否则返回 `null`，上游界面保持原样。

## 弹窗

- 表单：类型（默认 `DOMAIN-SUFFIX`；预填值是 IP 时用 `IP-CIDR` / `IP-CIDR6`）、域名或 IP、策略。策略默认取上次用过的（`localStorage` 的 `fork.surge-rule.policy`，读写都包在 try/catch 里），没有就取列表第一项。
- 有预填域名时，在表单下方以 chip 列出它自己和各级父域名（至少两段），点一下就换值。默认选最短的那个。
- 按钮：已有同一规则时显示「修改（当前 X）」，否则显示「添加到最前面」。输入框里按回车也会保存。
- 已有规则列表：按关键词过滤，最多显示 200 条。点击可编辑的行，把它填回表单；行尾是删除按钮。不可编辑的类型（`RULE-SET`、`PROCESS-NAME`、`AND` 等）显示为禁用。
- 保存或删除后提示「断开 N 个连接」。
- 弹窗内容只在打开时挂载，每次打开都从当前的预填值开始。

接口和写文件的细节见 `spec/src-tauri/src/fork/README.md` 的「规则编辑」。`fetch` 辅助函数和 `useSurgeActive` 放在 `src/components/fork/fork-api.ts`，与 `SurgeBridgeSetting` 共用。文案沿用组件内置的 zh / en 字典。
