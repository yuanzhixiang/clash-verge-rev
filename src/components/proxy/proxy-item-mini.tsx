import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseLoading } from '@/components/base'
import { useProxyDelayState } from '@/hooks/use-proxy-delay-state'
import { cn } from '@/lib/utils'
import delayManager from '@/services/delay'

interface Props {
  group: IProxyGroupItem
  proxy: IProxyItem
  selected: boolean
  showType?: boolean
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
        'rounded-[var(--radius-compact)] px-inline py-adjust text-body',
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
    <span className="mr-inline mt-auto inline-block rounded-[var(--radius-container)] border border-[var(--color-text-secondary)] px-inline text-[10px] leading-[1.5] text-[var(--color-text-secondary)]">
      {children}
    </span>
  )
}

// 多列布局
export const ProxyItemMini = (props: Props) => {
  const { group, proxy, selected, showType = true, onClick } = props

  const { t } = useTranslation()

  // -1/<=0 为不显示，-2 为 loading
  const { delayValue, isPreset, timeout, onDelay } = useProxyDelayState(
    proxy,
    group.name,
  )

  const showDelay = delayValue > 0

  return (
    <div
      onClick={() => onClick?.(proxy.name)}
      className={cn(
        'group relative flex h-14 cursor-pointer items-center justify-between rounded-[var(--radius-control)] bg-[var(--color-bg-card)] pr-component pl-stack',
        selected &&
          '-ml-[3px] w-[calc(100%+3px)] border-l-[3px] border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] dark:bg-[color-mix(in_srgb,var(--color-accent)_35%,transparent)]',
      )}
    >
      <div
        title={`${proxy.name}\n${proxy.now ?? ''}`}
        className="overflow-hidden"
      >
        <div className="block truncate break-all text-body text-[var(--color-text-primary)]">
          {proxy.name}
        </div>

        {showType && (
          <div className="mt-inline flex flex-none flex-nowrap">
            {proxy.now && (
              <div className="mr-component block truncate break-all text-body text-[var(--color-text-secondary)]">
                {proxy.now}
              </div>
            )}
            {!!proxy.provider && <TypeBox>{proxy.provider}</TypeBox>}
            <TypeBox>{proxy.type}</TypeBox>
            {proxy.udp && <TypeBox>UDP</TypeBox>}
            {proxy.xudp && <TypeBox>XUDP</TypeBox>}
            {proxy.tfo && <TypeBox>TFO</TypeBox>}
            {proxy.mptcp && <TypeBox>MPTCP</TypeBox>}
            {proxy.smux && <TypeBox>SMUX</TypeBox>}
          </div>
        )}
      </div>
      <div
        className={cn(
          'ml-inline text-[var(--color-accent)]',
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
              onDelay()
            }}
          >
            Check
          </Widget>
        )}

        {delayValue >= 0 && (
          // 显示延迟
          <Widget
            className={cn(
              'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]',
              !showDelay && 'group-hover:hidden',
            )}
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
        {proxy.type !== 'Direct' &&
          delayValue !== -2 &&
          delayValue < 0 &&
          selected && (
            // 展示已选择的 icon
            <CircleCheck className="mr-inline block size-4 group-hover:hidden" />
          )}
      </div>
      {group.fixed && group.fixed === proxy.name && (
        // 展示 fixed 状态
        <span
          className={cn(
            'absolute -top-[5px] -right-[5px] text-xs',
            proxy.name !== group.now && 'grayscale',
          )}
          title={
            group.type === 'URLTest'
              ? t('proxies.page.labels.delayCheckReset')
              : ''
          }
        >
          📌
        </span>
      )}
    </div>
  )
}
