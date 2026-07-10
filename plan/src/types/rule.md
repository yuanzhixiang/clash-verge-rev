# 运行时规则类型

## 类型职责

本地运行时规则类型补充当前 `tauri-plugin-mihomo-api` TypeScript 声明尚未暴露的 Mihomo 规则统计字段。

## 字段口径

- `RuntimeRule` 继承第三方 `Rule`，新增可选 `extra`。
- `RuntimeRuleExtra` 包含 `disabled / hitCount / hitAt / missCount / missAt`，字段保持与核心 JSON 一致。
- 页面仅展示 `hitCount`；其它字段用于完整描述响应和后续兼容，不在本轮增加 UI。

## 兼容性

- `extra` 及其字段均可选，旧核心或响应缺失时页面显示 `—`。
- 不修改第三方包、Mihomo API 或后端数据模型。
