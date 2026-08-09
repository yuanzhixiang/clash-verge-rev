# 规则集合内容读取命令

## 功能定位

`get_rule_provider_content` 根据当前运行时配置中的 provider 名称读取规则集合内容，为桌面前端、vergectl 和远程开发桥提供同一只读能力。

## 请求与响应

- 请求只包含 `provider_name`，不接受前端提供的文件路径。
- `ready` 返回 provider 名称、格式和字符串规则数组。
- `unavailable` 返回 `mrs`、`cachePathUnavailable` 或 `cacheMissing`。
- 配置缺失、内容格式错误、I/O 错误和安全校验失败作为命令错误返回。

## 处理规则

- provider 类型为 `inline` 时读取运行时配置中的 `payload` 字符串数组。
- YAML 读取顶层 `payload` 字符串数组；Text 按行读取并忽略空行与 `#` 注释。
- MRS 不转换、不读取；未配置显式 `path` 时不猜测 Mihomo 的派生缓存名。

## 安全与边界

- 相对路径以应用 HomeDir 为基准；目标存在后同时规范化 HomeDir 和目标路径。
- 规范化后的目标必须位于 HomeDir 内，拒绝绝对路径越界、`..` 穿越和符号链接逃逸。
- 命令只读，不修改缓存、运行时配置或远端资源。
