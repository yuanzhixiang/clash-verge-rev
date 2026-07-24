import { ChevronUp } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// 断点（与 tokens.css / Tailwind 一致），用于解析旧 MUI `sx` 的响应式对象
const BREAKPOINTS: Record<string, number> = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
}

// 数值型 CSS 属性中不应追加 px 的无单位值
const UNITLESS = new Set([
  'zIndex',
  'opacity',
  'fontWeight',
  'lineHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
  'zoom',
])

type SxLike = Record<string, unknown>

const resolveResponsive = (value: unknown, width: number): unknown => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).some((key) => key in BREAKPOINTS)
  ) {
    let resolved: unknown
    for (const key of Object.keys(BREAKPOINTS)) {
      const candidate = (value as SxLike)[key]
      if (candidate !== undefined && width >= BREAKPOINTS[key]) {
        resolved = candidate
      }
    }
    return resolved
  }
  return value
}

// 把兼容用的 `sx` 转成内联样式（数值 → px，响应式对象按断点解析）
const sxToStyle = (sx: SxLike | undefined, width: number): CSSProperties => {
  if (!sx) return {}
  const style: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(sx)) {
    const value = resolveResponsive(raw, width)
    if (value === undefined || value === null) continue
    style[key] =
      typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : value
  }
  return style as CSSProperties
}

interface Props {
  onClick: () => void
  show: boolean
  ariaLabel?: string
  className?: string
  /** 兼容旧的 MUI `sx`：响应式对象会按断点解析为内联样式。 */
  sx?: SxLike
}

export const ScrollTopButton = ({
  onClick,
  show,
  ariaLabel,
  className,
  sx,
}: Props) => {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      onClick={onClick}
      style={sxToStyle(sx, viewportWidth)}
      className={cn(
        'absolute bottom-inset right-inset rounded-full',
        'bg-[color-mix(in_srgb,var(--color-text-primary)_10%,transparent)]',
        'hover:bg-[color-mix(in_srgb,var(--color-text-primary)_20%,transparent)]',
        'transition-opacity duration-[var(--duration-base)]',
        show
          ? 'visible opacity-100'
          : 'pointer-events-none invisible opacity-0',
        className,
      )}
    >
      <ChevronUp />
    </Button>
  )
}
