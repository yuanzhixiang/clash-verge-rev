import { Gauge, Plus } from 'lucide-react'

import { BaseLoading } from '@/components/base'
import { useProxyDelayState } from '@/hooks/use-proxy-delay-state'
import { cn } from '@/lib/utils'
import delayManager from '@/services/delay'

// delayManager.formatDelayColor 返回 MUI palette 字符串，映射到语义 token。
const DELAY_COLOR_VAR: Record<string, string> = {
  'error.main': 'var(--color-danger)',
  'warning.main': 'var(--color-warning)',
  'primary.main': 'var(--color-accent)',
  'success.main': 'var(--color-success)',
}
const delayColorVar = (key: string): string | undefined => DELAY_COLOR_VAR[key]

const CARD_BASE =
  'group relative flex min-h-[92px] min-w-0 cursor-pointer appearance-none flex-col items-stretch justify-between overflow-hidden rounded-[var(--radius-container)] border-0 bg-[var(--color-bg-subtle)] px-3 py-2.5 text-left transition-[background-color,transform] duration-[160ms] ease-out hover:-translate-y-px hover:bg-[var(--color-bg-hover)] focus-visible:[outline:2px_solid_var(--color-focus-ring)] focus-visible:[outline-offset:2px]'

interface DelayLabelProps {
  proxy: IProxyItem
  groupName: string
  testLabel: string
}

export const PolicyDelayLabel = ({
  proxy,
  groupName,
  testLabel,
}: DelayLabelProps) => {
  const { delayValue, isPreset, timeout, onDelay } = useProxyDelayState(
    proxy,
    groupName,
  )

  if (isPreset) return null

  const delayColor =
    delayValue >= 0
      ? delayColorVar(delayManager.formatDelayColor(delayValue, timeout))
      : undefined

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        void onDelay(proxy.provider)
      }}
      aria-label={`${testLabel}: ${proxy.name}`}
      title={`${testLabel}: ${proxy.name}`}
      style={
        delayColor ? ({ '--dl': delayColor } as React.CSSProperties) : undefined
      }
      className="inline-flex min-h-[24px] min-w-0 cursor-pointer appearance-none items-center justify-start border-0 bg-transparent p-0 text-[12px] leading-[1.2] text-[var(--dl,var(--color-text-secondary))] hover:text-[var(--color-accent)]"
    >
      {delayValue === -2 ? (
        <BaseLoading />
      ) : delayValue >= 0 ? (
        delayManager.formatDelay(delayValue, timeout)
      ) : (
        <>
          <Gauge className="mr-1 size-[15px]" />
          {testLabel}
        </>
      )}
    </button>
  )
}

interface ProxyCardProps {
  proxy: IProxyItem
  testLabel: string
  onContextMenu?: (
    event: React.MouseEvent<HTMLElement>,
    proxy: IProxyItem,
  ) => void
}

export const PolicyProxyCard = ({
  proxy,
  testLabel,
  onContextMenu,
}: ProxyCardProps) => {
  const { delayValue, timeout, onDelay } = useProxyDelayState(
    proxy,
    'policy-standalone',
  )

  const delayColor =
    delayValue >= 0
      ? delayColorVar(delayManager.formatDelayColor(delayValue, timeout))
      : undefined

  return (
    <button
      type="button"
      onClick={() => void onDelay(proxy.provider)}
      onContextMenu={(event) => {
        if (!onContextMenu) return
        event.preventDefault()
        onContextMenu(event, proxy)
      }}
      aria-label={`${testLabel}: ${proxy.name}`}
      title={`${testLabel}: ${proxy.name}`}
      className={CARD_BASE}
    >
      <div className="w-full min-w-0">
        <p
          title={proxy.type}
          className="mb-0.5 truncate text-[11.5px] leading-[1.25] text-[var(--color-text-muted)]"
        >
          {proxy.type}
        </p>
        <p className="truncate text-[15px] font-semibold leading-[1.3]">
          {proxy.name}
        </p>
      </div>
      <div className="flex min-h-[24px] w-full min-w-0 items-center">
        {delayValue === -2 ? (
          <BaseLoading />
        ) : (
          <p
            className="truncate text-[12px] font-medium leading-[1.3] text-[var(--color-text-muted)]"
            style={delayColor ? { color: delayColor } : undefined}
          >
            {delayValue >= 0
              ? delayManager.formatDelay(delayValue, timeout)
              : testLabel}
          </p>
        )}
      </div>
    </button>
  )
}

interface AddCardProps {
  label: string
  onClick: () => void
}

/** 网格末尾的虚线 "+" 新增卡片（仅 Local profile 显示）。 */
export const PolicyAddCard = ({ label, onClick }: AddCardProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="flex min-h-[92px] cursor-pointer appearance-none items-center justify-center rounded-[var(--radius-container)] border-[1.5px] border-dashed border-[var(--color-border-strong)] bg-transparent text-[var(--color-text-secondary)] transition-[background-color,transform] duration-[160ms] ease-out hover:-translate-y-px hover:bg-[var(--color-bg-hover)] focus-visible:[outline:2px_solid_var(--color-focus-ring)] focus-visible:[outline-offset:2px]"
  >
    <Plus className="size-[22px]" />
  </button>
)

interface GroupCardProps {
  group: IProxyGroupItem
  open: boolean
  readonly: boolean
  /** position 仅右键（有鼠标坐标）时提供，键盘打开时缺省。 */
  onOpenMenu: (
    anchorEl: HTMLElement,
    position?: { top: number; left: number },
  ) => void
}

export const PolicyGroupCard = ({
  group,
  open,
  readonly,
  onOpenMenu,
}: GroupCardProps) => (
  <button
    type="button"
    onContextMenu={(event) => {
      event.preventDefault()
      onOpenMenu(event.currentTarget, {
        top: event.clientY,
        left: event.clientX,
      })
    }}
    onKeyDown={(event) => {
      const opensContextMenu =
        event.key === 'ContextMenu' ||
        (event.shiftKey && event.key === 'F10') ||
        event.key === 'Enter' ||
        event.key === ' '
      if (!opensContextMenu) return
      event.preventDefault()
      onOpenMenu(event.currentTarget)
    }}
    aria-haspopup="dialog"
    aria-expanded={open}
    className={cn(CARD_BASE, 'w-full', open && 'bg-[var(--color-bg-active)]')}
  >
    <div className="min-w-0">
      <div className="flex items-center gap-compact">
        <p
          title={group.type}
          className="min-w-0 truncate text-[11.5px] leading-[1.25] text-[var(--color-text-muted)]"
        >
          {group.type}
        </p>
        {readonly && (
          <span className="text-[10.5px] leading-[1.2] text-[var(--color-text-muted)]">
            · Auto
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-[15px] font-semibold leading-[1.3]">
        {group.name}
      </p>
    </div>

    <div className="flex min-w-0 items-center">
      <p
        title={group.now}
        className="min-w-0 truncate text-[12px] font-medium leading-[1.3] text-[var(--color-text-muted)]"
      >
        {group.now || '—'}
      </p>
    </div>
  </button>
)
