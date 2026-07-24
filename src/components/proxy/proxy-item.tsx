import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { BaseLoading } from '@/components/base'
import { useProxyDelayState } from '@/hooks/use-proxy-delay-state'
import { cn } from '@/lib/utils'
import delayManager from '@/services/delay'

interface Props {
  group: IProxyGroupItem
  proxy: IProxyItem
  selected: boolean
  showType?: boolean
  className?: string
  onClick?: (name: string) => void
}

// 延迟 / Check 小组件
function Widget({
  className,
  style,
  onClick,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
  children: ReactNode
}) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        'rounded-[var(--radius-compact)] px-compact py-adjust text-body',
        className,
      )}
    >
      {children}
    </div>
  )
}

// 描边标签
function TypeBox({ children }: { children: ReactNode }) {
  return (
    <span className="mr-inline inline-block rounded-[var(--radius-container)] border border-[color-mix(in_srgb,var(--color-text-secondary)_36%,transparent)] px-adjust text-[10px] leading-[1.25] text-[color-mix(in_srgb,var(--color-text-secondary)_42%,transparent)]">
      {children}
    </span>
  )
}

export const ProxyItem = (props: Props) => {
  const { group, proxy, selected, showType = true, className, onClick } = props

  // -1/<=0 为不显示，-2 为 loading
  const { delayValue, isPreset, timeout, onDelay } = useProxyDelayState(
    proxy,
    group.name,
  )

  const showDelay = delayValue > 0

  return (
    <li
      className={cn(
        'flex w-full items-center px-inset py-component',
        className,
      )}
    >
      <div
        onClick={() => onClick?.(proxy.name)}
        className={cn(
          'group mb-component flex h-10 w-full cursor-pointer items-center rounded-[var(--radius-compact)] bg-[var(--color-bg-card)] px-inset',
          selected &&
            '-ml-[3px] w-[calc(100%+3px)] border-l-[3px] border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] dark:bg-[color-mix(in_srgb,var(--color-accent)_35%,transparent)]',
        )}
      >
        <div className="min-w-0 flex-1" title={proxy.name}>
          <span className="mr-component inline-block text-body text-[var(--color-text-primary)]">
            {proxy.name}
            {showType && proxy.now && ` - ${proxy.now}`}
          </span>
          {showType && !!proxy.provider && <TypeBox>{proxy.provider}</TypeBox>}
          {showType && <TypeBox>{proxy.type}</TypeBox>}
          {showType && proxy.udp && <TypeBox>UDP</TypeBox>}
          {showType && proxy.xudp && <TypeBox>XUDP</TypeBox>}
          {showType && proxy.tfo && <TypeBox>TFO</TypeBox>}
          {showType && proxy.mptcp && <TypeBox>MPTCP</TypeBox>}
          {showType && proxy.smux && <TypeBox>SMUX</TypeBox>}
        </div>

        <div
          className={cn(
            'flex items-center justify-end text-[var(--color-accent)]',
            isPreset && 'hidden',
          )}
        >
          {delayValue === -2 && (
            <Widget>
              <BaseLoading />
            </Widget>
          )}

          {delayValue !== -2 && (
            <Widget
              className={cn(
                'hidden cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]',
                !showDelay && 'group-hover:block',
              )}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelay(proxy.provider)
              }}
            >
              Check
            </Widget>
          )}

          {delayValue > 0 && (
            // 显示延迟
            <Widget
              className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]"
              style={{
                color: delayManager.formatDelayColor(delayValue, timeout),
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelay(proxy.provider)
              }}
            >
              {delayManager.formatDelay(delayValue, timeout)}
            </Widget>
          )}

          {delayValue !== -2 && delayValue <= 0 && selected && (
            // 展示已选择的 icon
            <CircleCheck className="size-4 group-hover:hidden" />
          )}
        </div>
      </div>
    </li>
  )
}
