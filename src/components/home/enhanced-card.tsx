import { forwardRef, type ReactNode, type Ref } from 'react'

import { cn } from '@/lib/utils'

// 自定义卡片组件接口
interface EnhancedCardProps {
  title: ReactNode
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
  iconColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'
  minHeight?: number | string
  noContentPadding?: boolean
}

// 图标底色/文字色随语义色变化（原 alpha(palette[iconColor].main, .12) + 主色文字）
const ICON_COLOR_CLASS: Record<
  NonNullable<EnhancedCardProps['iconColor']>,
  string
> = {
  primary:
    'text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]',
  secondary:
    'text-[var(--color-secondary)] bg-[color-mix(in_srgb,var(--color-secondary)_12%,transparent)]',
  error:
    'text-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)]',
  warning:
    'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)]',
  info: 'text-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)]',
  success:
    'text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)]',
}

// 自定义卡片组件
export const EnhancedCard = forwardRef<HTMLElement, EnhancedCardProps>(
  (
    {
      title,
      icon,
      action,
      children,
      iconColor = 'primary',
      minHeight,
      noContentPadding = false,
    },
    ref,
  ) => {
    return (
      <div
        ref={ref as Ref<HTMLDivElement>}
        className="flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] transition-[border-color,transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-card-hover)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-inset py-stack">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden">
            <div
              className={cn(
                'mr-stack flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]',
                ICON_COLOR_CLASS[iconColor],
              )}
            >
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              {typeof title === 'string' ? (
                <h3
                  title={title}
                  className="block max-w-full truncate text-h3 font-semibold tracking-[-0.015em] text-[var(--color-text-primary)]"
                >
                  {title}
                </h3>
              ) : (
                <div className="block max-w-full truncate">{title}</div>
              )}
            </div>
          </div>
          {action && <div className="ml-inset shrink-0">{action}</div>}
        </div>
        <div
          className={cn(
            'flex flex-1 flex-col',
            noContentPadding ? 'p-0' : 'p-inset',
          )}
          style={minHeight ? { minHeight } : undefined}
        >
          {children}
        </div>
      </div>
    )
  },
)
