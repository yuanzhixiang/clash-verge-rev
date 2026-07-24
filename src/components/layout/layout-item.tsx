import type { ReactNode } from 'react'
import { useCallback, useSyncExternalStore } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'

// 轻量 matchMedia 钩子，替代 MUI 的 useMediaQuery（useSyncExternalStore 实现）
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

interface Props {
  to: string
  children: string
  icon: ReactNode[]
  onPreload?: () => Promise<unknown>
}
export const LayoutItem = (props: Props) => {
  const { to, children, icon, onPreload } = props
  const { verge } = useVerge()
  const { menu_icon } = verge ?? {}
  const navCollapsed = verge?.collapse_navbar ?? false
  const compactByViewport = useMediaQuery('(max-width:720px)')
  const compact = navCollapsed || compactByViewport
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: true })
  const navigate = useNavigate()
  const selected = !!match

  const effectiveMenuIcon =
    compact && menu_icon === 'disable' ? 'monochrome' : menu_icon

  const handlePreload = useCallback(() => {
    void onPreload?.().catch(() => {})
  }, [onPreload])

  return (
    <li className="mx-auto w-full max-w-[250px] px-0 py-adjust">
      <button
        type="button"
        title={compact ? children : undefined}
        aria-label={children}
        aria-current={selected ? 'page' : undefined}
        onFocus={handlePreload}
        onMouseEnter={handlePreload}
        onPointerDown={handlePreload}
        onClick={() => navigate(to)}
        className={cn(
          'flex min-h-[44px] w-full cursor-pointer items-center rounded-[var(--radius-control)] px-stack py-inline transition-colors duration-[var(--duration-base)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]',
          'active:bg-[var(--color-bg-active)]',
          selected
            ? 'bg-[var(--color-bg-active)] hover:bg-[var(--color-bg-active)]'
            : 'hover:bg-[var(--color-bg-hover)]',
        )}
      >
        {(effectiveMenuIcon === 'monochrome' || !effectiveMenuIcon) && (
          <span className="flex min-w-9 items-center text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-base)] [&_svg]:size-5">
            {icon[0]}
          </span>
        )}
        {effectiveMenuIcon === 'colorful' && (
          <span className="flex min-w-9 items-center opacity-[0.72] transition-opacity duration-[var(--duration-base)] [&_svg]:size-5">
            {icon[1]}
          </span>
        )}
        <span
          className={cn(
            'm-0 min-w-0 text-left text-[14.5px] font-[450] tracking-[-0.005em] text-[var(--color-text-primary)]',
            effectiveMenuIcon === 'disable' ? 'pl-component' : 'pl-0',
          )}
        >
          {children}
        </span>
      </button>
    </li>
  )
}
