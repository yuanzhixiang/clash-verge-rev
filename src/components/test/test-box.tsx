import * as React from 'react'

import { cn } from '@/lib/utils'

export type TestBoxProps = React.HTMLAttributes<HTMLDivElement> & {
  'aria-selected'?: boolean
}

/**
 * 测试卡片按钮基座：语义 token 化的可点击卡片。
 * 选中态通过 `aria-selected` 控制 h2 主色高亮。
 */
export const TestBox = React.forwardRef<HTMLDivElement, TestBoxProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative box-border block w-full cursor-pointer px-inset py-component text-left',
        'rounded-[var(--radius-container)] shadow-[var(--shadow-card)]',
        'text-[var(--color-text-secondary)] dark:text-[color-mix(in_srgb,var(--color-text-secondary)_65%,transparent)]',
        'bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)] dark:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]',
        'transition-[background-color,box-shadow] duration-[var(--duration-slow)]',
        'hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]',
        'hover:shadow-[var(--shadow-card-hover)]',
        '[&_h2]:text-[var(--color-text-primary)] aria-selected:[&_h2]:text-[var(--color-accent)]',
        className,
      )}
      {...props}
    />
  ),
)
TestBox.displayName = 'TestBox'
