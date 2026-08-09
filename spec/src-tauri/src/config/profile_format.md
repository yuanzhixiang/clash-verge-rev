# 主 Profile 文件格式

## 功能定位

local/remote 主 Profile 的声明文件继续记录为 YAML。同目录存在同 stem `.conf` 时，CONF 作为完整本地覆盖并优先参与读取、增强、编辑、打开、定位和验证；删除 CONF 后恢复 YAML。遗留 `.toml` 不再加载，也不自动删除。

## CONF 语法

- 固定段落为 `[General]`、`[Proxy]`、`[Proxy Group]`、`[Proxy Provider]`、`[Rule Provider]`、`[Rule]`、`[Host]` 和 `[Mihomo]`。
- 节点使用 `名称 = 类型, server, port, key=value...`；代理组使用 `名称 = 类型, 成员..., key=value...`；规则每行一条。
- 值支持安全裸字符串及 JSON 字符串、数字、布尔、null、数组和对象。tokenizer 必须识别引号、转义和嵌套括号，嵌套 JSON 中的逗号和等号不得被错误切分。
- `[General]` 保存普通顶层标量；`[Host]` 保存 hosts；无法归入专用段落的顶层值以紧凑 JSON 写入 `[Mihomo]`，保证 Mihomo 字段无损往返。
- 输入兼容既有 Surge 节点参数别名和 proxy group `policy-path`；生成文件使用 Mihomo 原生字段，并声明为 Clash Verge Surge-style profile，不承诺可由 Surge 直接加载。
- `[MITM]`、`[URL Rewrite]` 和未知段落必须返回带行号错误，不得静默忽略。

## 解析与转换

- YAML 与 CONF 统一解析为 `serde_yaml::Mapping`，最终交给 Mihomo 的运行时文件仍为 YAML。
- CONF 存在但无效时直接报错，不回退 YAML。
- YAML 转 CONF 时保留 null 和所有可表达的数据；非字符串键、tagged YAML 或无法安全表达的值返回字段路径。
- 转换完成后重新解析 CONF，并与规范化 YAML 映射比较；一致后通过临时文件原子替换目标。
- 原始文本保存保持用户格式；结构化编辑会规范化重写并可能丢失注释。

## 文件生命周期

- 远程更新始终写声明 YAML，不覆盖 CONF；若 CONF 生效则提示 YAML 尚未应用。
- 删除主 Profile 时同时删除 YAML、CONF 和遗留同 stem TOML。
- 孤儿清理识别 CONF 并保护活动主 Profile 的 YAML/CONF，但不主动清理遗留 TOML。
- Merge、Rules、Proxies、Groups 及全局扩展不启用 CONF sibling 规则。
