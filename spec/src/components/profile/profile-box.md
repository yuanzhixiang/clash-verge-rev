# ProfileBox

## 组件职责

ProfileBox 是普通 Profile 与全局扩展行共享的中性列表表面，负责统一高度、边界、hover、选中和焦点视觉，不承载业务数据或操作逻辑。

## 输入与组合关系

- 接收 MUI Box 的标准属性以及 `aria-selected`。
- 由 `ProfileItem` 和 `ProfileMore` 组合使用，外层列表容器负责圆角和 hairline 外框。

## 视觉与交互状态

- 默认最小高度 64px，使用透明背景和行底 hairline。
- hover 使用低对比中性背景。
- selected 只增加柔和中性背景，不改变文字字重、图标颜色或使用高饱和强调色。
- `focus-visible` 使用现有 shell 焦点变量绘制内收轮廓。
- 具体 disabled、loading、拖拽和点击行为由上层组件控制。

## 边界状态

- 长内容必须由子组件截断，ProfileBox 自身保持全宽且不产生横向滚动。
- 列表最后一行的底边由父容器样式移除，避免与外框重叠。
