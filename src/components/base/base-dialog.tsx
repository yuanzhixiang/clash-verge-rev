import { Loader2 } from 'lucide-react'
import { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  title: ReactNode
  open: boolean
  okBtn?: ReactNode
  cancelBtn?: ReactNode
  disableEnforceFocus?: boolean
  disableOk?: boolean
  disableCancel?: boolean
  disableFooter?: boolean
  // 原为 MUI SxProps<Theme>；迁移后改为无 MUI 依赖的宽松对象类型，
  // 现有消费方传入的内联对象字面量（含响应式与 pb 等简写）仍可原样编译。
  contentSx?: Record<string, unknown>
  children?: ReactNode
  loading?: boolean
  onOk?: () => void
  onCancel?: () => void
  onClose?: () => void
}

export interface DialogRef {
  open: () => void
  close: () => void
}

// Monaco 及其它浮层 widget 会渲染到 dialog 之外的 portal，
// disableEnforceFocus 场景下点击这些 widget 不应关闭弹窗。
const OVERLAY_WIDGET_SELECTOR = [
  '.monaco-editor',
  '.monaco-hover',
  '.monaco-list',
  '.suggest-widget',
  '.monaco-menu',
  '.context-view',
  '.editor-widget',
  '.quick-input-widget',
].join(', ')

// MUI 间距简写（数值 × 8px）→ 对应 CSS 属性
const SPACING_UNIT = 8
const SPACING_PROPS: Record<string, string[]> = {
  m: ['margin'],
  mt: ['marginTop'],
  mb: ['marginBottom'],
  ml: ['marginLeft'],
  mr: ['marginRight'],
  mx: ['marginLeft', 'marginRight'],
  my: ['marginTop', 'marginBottom'],
  p: ['padding'],
  pt: ['paddingTop'],
  pb: ['paddingBottom'],
  pl: ['paddingLeft'],
  pr: ['paddingRight'],
  px: ['paddingLeft', 'paddingRight'],
  py: ['paddingTop', 'paddingBottom'],
}

const BREAKPOINTS = ['xs', 'sm', 'md', 'lg', 'xl']

// 响应式对象 { xs, sm, ... } → 取最大已定义断点（面向桌面）；否则原样返回
function resolveResponsive(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0 &&
    Object.keys(value as object).every((k) => BREAKPOINTS.includes(k))
  ) {
    const obj = value as Record<string, unknown>
    for (let i = BREAKPOINTS.length - 1; i >= 0; i--) {
      const v = obj[BREAKPOINTS[i]]
      if (v != null) return v
    }
    return undefined
  }
  return value
}

// 尽力把 MUI sx 对象转换为内联 style：
// 响应式取桌面值、间距简写换算为 px、函数/嵌套选择器等无法静态解析的结构忽略。
function sxToStyle(
  sx?: Record<string, unknown>,
): React.CSSProperties | undefined {
  if (!sx) return undefined
  const style: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(sx)) {
    if (typeof raw === 'function') continue
    const value = resolveResponsive(raw)
    if (value === undefined) continue
    const spacingTargets = SPACING_PROPS[key]
    if (spacingTargets) {
      const px = typeof value === 'number' ? value * SPACING_UNIT : value
      for (const target of spacingTargets) style[target] = px
      continue
    }
    style[key] = value
  }
  return style as React.CSSProperties
}

export const BaseDialog: React.FC<Props> = ({
  open,
  title,
  children,
  okBtn,
  cancelBtn,
  disableEnforceFocus,
  contentSx,
  disableCancel,
  disableOk,
  disableFooter,
  loading,
  onOk,
  onCancel,
  onClose,
}) => {
  const style = sxToStyle(contentSx)
  // contentSx 指定了宽度时解除默认桌面宽度上限，让其生效；
  // 基础的 max-w-[calc(100%-2rem)] 仍保留，避免小屏溢出。
  const hasWidth = !!style && ('width' in style || 'maxWidth' in style)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        aria-describedby={undefined}
        style={style}
        className={hasWidth ? 'sm:max-w-none' : undefined}
        onOpenAutoFocus={
          disableEnforceFocus ? (e) => e.preventDefault() : undefined
        }
        onInteractOutside={
          disableEnforceFocus
            ? (e) => {
                const target = e.target as HTMLElement | null
                if (target?.closest(OVERLAY_WIDGET_SELECTOR)) {
                  e.preventDefault()
                }
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {children}

        {!disableFooter && (
          <DialogFooter>
            {!disableCancel && (
              <Button variant="outline" onClick={onCancel}>
                {cancelBtn}
              </Button>
            )}
            {!disableOk && (
              <Button disabled={loading} onClick={onOk}>
                {loading && <Loader2 className="animate-spin" />}
                {okBtn}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
