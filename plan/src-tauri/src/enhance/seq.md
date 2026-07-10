# 顺序增强原位替换

## 模块职责

顺序增强在 prepend、原始序列、append 的既有结构中增加持久化 replace，用于在不移动规则优先级槽位的情况下替换字符串规则。

## 数据格式

- `SeqMap` 新增默认空的 `replace` 数组，元素为 `{ from, to }`；旧 YAML 缺少该字段时保持兼容。
- replace 仅在 field 为 `rules` 时生效，proxies 和 proxy-groups 忽略该数组。

## 应用规则

- 顺序保持 `prepend + 原始序列 + append`；原始序列先按 delete 排除，再按 replace 声明顺序消费完全匹配的字符串项。
- 每个 replacement 最多消费一个原始项；未找到 from 时不插入 to，也不影响其它项。
- 多个 replacement 和重复 from 按数组顺序匹配后续出现的同值原始项，行为确定且不批量替换。

## 兼容与测试

- 不修改 Mihomo 配置格式；replace 只存在于 Clash Verge 的规则 enhancement 文件。
- 测试覆盖旧 YAML 反序列化、原位替换、未命中、多条替换、重复源以及非 rules 字段不应用。
