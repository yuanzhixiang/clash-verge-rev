# 设计系统规范

本项目的所有视觉样式由三部分共同治理：

- `tokens.css` — 基础层：原始 + 语义 design token。间距、文字、颜色、圆角、
  阴影、动效、尺寸、z-index、断点的唯一事实源。
- `shadcn-adapter.css` — 项目的 `globals.css`。把 shadcn/ui（Tailwind v4）的
  主题变量映射到我们的语义 token，并向 Tailwind 注册语义间距/文字工具类。
  改主题只改 `tokens.css`，不改本文件，更不改组件源码。
- `components/ui/*` — 组件层，采纳自 shadcn/ui。源码归本项目所有；
  Radix 提供的行为与无障碍能力必须保持完整。

暗色模式基于 class（`<html>` 上的 `.dark`，配 next-themes）。暗色覆写
集中在适配层的 `.dark` 块中，且只覆写语义 token。

## 核心规则

1. **业务代码只允许引用语义层 token**（通过 `var()` 或下文的语义工具类）。
   禁止使用原始层变量，禁止裸值。
2. **禁止魔法数字。** 间距、字号、字重、颜色、圆角、阴影、动画时长/缓动
   一律不允许字面量（如 `margin-top: 20px`、`color: #666`、`transition: 0.3s ease`）。
   例外仅有：`border-width: 1px`、`0`、`@media` 中的断点字面量。
3. **禁止发明新值。** 现有 token 不适配时，选最接近的一档并报告：
   "此处 token 不适配，建议新增语义 token：`<名字>: <职责>`"，由人决定。
   禁止静默硬编码。
4. **暗色模式只覆写语义层**，位置在适配层的 `.dark` 块。新增颜色必须
   同时补暗色值。间距、文字、圆角两种模式下不变。
5. **一致性优先于局部美观。** 按 token 实现后略有瑕疵的，保留 token 并
   指出问题，不许用一次性硬编码去"修"。

## 组件层：shadcn/ui

- **优先使用已有 shadcn 组件。** 按钮、对话框、下拉、选择器、toast 等
  shadcn 已提供的，禁止手搓同类组件。缺的组件用 shadcn CLI 装进
  `components/ui/`。
- **组件是自有源码。** 变体和视觉修改进组件文件本身（扩展它的 `cva`
  variants），禁止在调用处用 `className` 覆盖。
- **调用处只允许传布局类**：宽度、flex/grid 定位、以及使用语义工具类的
  外部间距（`mb-block`、`gap-stack`）。调用处禁止覆盖组件的颜色、
  padding、圆角、阴影、字体。
- **`components/ui/` 内部由 shadcn 配方治理**：数字间距类（`px-3`、`gap-2`）
  和 shadcn 颜色类（`bg-accent`、`text-muted-foreground`）只允许在这里出现。
- 命名提醒：shadcn 语境的 `accent` 是悬停面，不是品牌主色；品牌主色是
  `primary`。
- **禁止在组件文件里改主题值。** 一切主题走 `tokens.css` → 适配层。
- **无障碍：** 禁止删除 Radix 提供的 ARIA 属性、键盘处理和焦点样式。
  页面级语义（唯一 `h1`、标题层级、landmark）与颜色对比度仍由我们负责。
  动效必须尊重 `prefers-reduced-motion`。

## 间距：先判断关系，再查表

在 `components/ui/` 之外，使用语义工具类（或等价 `var()`）：

| 关系 | 工具类 / token | 值 | 典型场景 |
|---|---|---|---|
| 光学校准 | `*-adjust` | 2px | 图标与文字对齐补偿 |
| 同一元素的内部部件 | `*-inline` | 4px | 图标与其文字 |
| 紧凑控件内衬 | `*-compact` | 6px | 高密度菜单项 |
| 组件内部 | `*-component` | 8px | 组件内元素间 |
| 同组相邻项 | `*-stack` | 12px | 列表项之间 |
| 容器内衬 | `*-inset` | 16px | 卡片 padding、表单字段间 |
| 内容块之间 | `*-block` | 24px | 卡片与卡片、gutter、页边距 |
| 小节之间 | `*-section-sm` | 32px | 标题区与内容 |
| 大区块之间 | `*-section` | 48px | 页面章节分隔 |
| 页面级留白 | `*-page` | 64px | hero、页脚前 |

`*` 可以是任意间距工具类前缀：`p-inset`、`gap-stack`、`mb-block`、
`space-y-stack` 等。数字间距类（`p-4`、`gap-3`）在 `components/ui/` 之外禁用。

间距编码归属关系——关系越近间距越小。要表达"更疏远"就上调一档，
不许微调像素。优先用父容器 `gap`，不给子元素各自加 margin。

## 文字：只有八个角色

每个角色 = 尺寸行高工具类 + 配套字重类，必须成对使用，禁止混搭：

| 角色 | 工具类 | 字重类 | 用途 |
|---|---|---|---|
| Caption | `text-caption` | `font-normal` | 辅助说明、时间戳 |
| Label | `text-label` | `font-medium` | 表单标签、按钮文字 |
| Body | `text-body` | `font-normal` | 应用界面正文默认 |
| Body large | `text-body-lg` | `font-normal` | 营销页/长文正文 |
| H3 | `text-h3` | `font-semibold` | 卡片标题 |
| H2 | `text-h2` | `font-semibold` | 区块标题 |
| H1 | `text-h1` | `font-semibold` + `tracking-tight` | 页面标题（每页至多一个） |
| Display | `text-display` | `font-bold` + `tracking-tight` | 营销页 hero |

字体族只允许 `--font-sans` 和 `--font-mono`，禁止直接写字体名。

## 颜色

- 文字只用四级：`--color-text-primary/secondary/muted/disabled`
  （业务代码优先用 shadcn 工具类：`text-foreground`、`text-muted-foreground`）。
- 背景只用：`--color-bg-page/subtle/hover/active`（`bg-background`、`bg-muted`、
  悬停面用 `bg-accent`）。
- 边框：默认 `--color-border`，输入框 `--color-border-strong`
  （`border-border`、`border-input`）。
- **品牌主色只出现在：可交互元素、当前/选中状态、focus ring**
  （`bg-primary`、`text-primary`、`ring-ring`）。禁止装饰性使用。
  主色出现得越少越有力。
- 状态色只用于真实状态语义，配 `*-subtle` 底色。破坏性操作用 `destructive`。
- 模态/抽屉遮罩用 `--color-backdrop`；focus 样式用组合好的 `--focus-ring`，
  禁止手拼 outline。

## 圆角、阴影、动效

- 圆角：控件 `--radius-control`，卡片/弹层 `--radius-card`，徽章
  `--radius-pill`。shadcn 的 `rounded-lg` 即控件圆角。不许出现第四种。
- 阴影：`--shadow-card` / `--shadow-dropdown` / `--shadow-modal`，宁浅勿深。
- 交互反馈统一：`transition: var(--transition-control);`
- 弹层出现：`--motion-popover`（下拉/tooltip）或 `--motion-overlay`
  （模态/抽屉）。动画属性只允许 transform 与 opacity。
- 所有动画尊重 `prefers-reduced-motion: reduce`（降级为无动画或仅 opacity）。

## 尺寸、层级、断点

- 控件高度三档：`--size-control-sm/md/lg`（32/36/40px），同一行的输入框
  与按钮必须同档。
- 图标三档：`--icon-sm/md/lg`（16/20/24px），`--icon-sm` 配 label/body 文字。
- 禁止裸写 `z-index`，用刻度（arbitrary value 写法 `z-[var(--z-modal)]`）：
  `--z-dropdown` < `--z-sticky` < `--z-drawer` < `--z-modal` < `--z-toast`
  < `--z-tooltip`。
- 断点：640 / 768 / 1024 / 1280（sm/md/lg/xl）——只通过 Tailwind 响应式
  前缀使用，这些字面量不允许出现在其他任何地方。

## 自检清单（生成代码前过一遍）

- [ ] 样式无字面量数值/色值（除 0、1px 边框、断点）
- [ ] 业务代码只引用语义 token / 语义工具类
- [ ] 数字间距类只出现在 `components/ui/` 内部
- [ ] 用了已有 shadcn 组件而不是手搓同类
- [ ] 调用处没有视觉性 `className` 覆盖
- [ ] 间距按关系查表选取，同层级一致
- [ ] 文字角色与字重成对使用，没有第九种文字样式
- [ ] 品牌主色只在可交互/选中/focus 场景出现
- [ ] 新增颜色补齐了 `.dark` 覆写
- [ ] Radix 的 ARIA/键盘/焦点行为未被破坏；动效尊重 reduced motion
