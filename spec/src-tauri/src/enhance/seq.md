# 顺序增强原位替换

## 模块职责

顺序增强在 prepend、原始序列、append 的既有结构中增加持久化 replace，用于在不移动规则优先级槽位的情况下替换字符串规则。

## 数据格式

- `SeqMap` 新增默认空的 `replace` 数组，元素为 `{ from, to }`；旧 YAML 缺少该字段时保持兼容。
- replace 仅在 field 为 `rules` 时生效，proxies 和 proxy-groups 忽略该数组。
- `SeqMap` 另有默认空的 `disabled` 字符串数组，保存「保留但禁用」的规则原文，同样仅 rules 链使用。

## 应用规则

- `disabled` 完全不参与配置生成：被禁用的规则必须照常出现在最终 `rules` 里，`use_seq` 显式丢弃该字段，禁用状态由 `core::rule_disable` 在 apply 之后向核心重放。
- 顺序保持 `prepend + 原始序列 + append`；原始序列先按 delete 排除，再按 replace 声明顺序消费完全匹配的字符串项。
- 每个 replacement 最多消费一个原始项；未找到 from 时不插入 to，也不影响其它项。
- 多个 replacement 和重复 from 按数组顺序匹配后续出现的同值原始项，行为确定且不批量替换。

## 兼容与测试

- 不修改 Mihomo 配置格式；replace 与 disabled 只存在于 Clash Verge 的规则 enhancement 文件。
- 测试覆盖旧 YAML 反序列化、原位替换、未命中、多条替换、重复源以及非 rules 字段不应用。
- 测试覆盖缺少 `disabled` 字段的旧 YAML 反序列化，以及 disabled 不影响生成结果。
