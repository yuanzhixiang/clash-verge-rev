# ProfileMore

## 组件职责

ProfileMore 展示 Global Extend Config 和 Global Extend Script 两个扩展文件的紧凑列表行，复用普通 Profile 的表面与文件操作口径。

## 输入与数据

- `id` 仅允许固定值 `Merge` 或 `Script`。
- Script 可接收运行日志；保存后通过 `onSave` 通知页面重新增强配置。

## 视觉与交互状态

- 行内显示扩展名称、低对比类型标签以及可见更多按钮。
- Script 有异常日志时使用错误圆点提示，日志按钮仍可访问。
- 双击打开编辑器；右键和更多按钮打开同一菜单。
- 菜单包含 Edit File、Open File 和 Reveal in Finder。Reveal 只传固定标识给后端，不接收路径。
- hover、focus 和菜单键盘行为沿用 `ProfileBox` 与 MUI 默认状态。

## 边界与组合关系

- 两项共同位于 Profiles 页的 Extensions hairline 列表中。
- 长标题需保持截断，不挤压日志和更多按钮。
- 编辑加载失败、保存失败和定位失败继续通过既有编辑器或全局通知反馈。
