import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { delayGroup } from 'tauri-plugin-mihomo-api'

import { BaseEmpty, BaseLoading, VirtualList } from '@/components/base'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useProxyDelayState } from '@/hooks/use-proxy-delay-state'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import delayManager from '@/services/delay'

interface Props {
  anchorEl: HTMLElement | null
  /** 右键时的鼠标坐标；提供时菜单左上角对齐光标，缺省（键盘打开）锚定卡片。 */
  position?: { top: number; left: number }
  group: IProxyGroupItem | null
  readonly: boolean
  /** 当前 profile 是否允许编辑（Local 类型）。 */
  canEdit: boolean
  onClose: () => void
  onSelect: (group: IProxyGroupItem, proxy: IProxyItem) => void
  onUpdated: () => void
  onEdit: (group: IProxyGroupItem) => void
  onDuplicate: (group: IProxyGroupItem) => void
  onDelete: (group: IProxyGroupItem) => void
}

/** delayManager.formatDelayColor 返回 MUI palette 字符串，映射到语义 token。 */
const DELAY_COLOR_VAR: Record<string, string> = {
  'error.main': 'var(--color-danger)',
  'warning.main': 'var(--color-warning)',
  'primary.main': 'var(--color-accent)',
  'success.main': 'var(--color-success)',
}
const delayColorVar = (key: string): string | undefined => DELAY_COLOR_VAR[key]

/** macOS 原生 NSMenu 的像素几何规格，对照 Surge 截图取值，可在此微调。 */
const MENU = {
  width: 300,
  padY: 5,
  rowHeight: 24,
  inset: 5,
  checkCol: 17,
} as const

const MENU_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', sans-serif"

const ROW_HEIGHT = MENU.rowHeight
const MAX_LIST_HEIGHT = 400
const EMPTY_LIST_HEIGHT = 96

const focusSibling = (current: HTMLElement, direction: 1 | -1) => {
  const root = current.closest('[data-policy-node-list]')
  const nodes = root?.querySelectorAll<HTMLElement>('[data-policy-node]')
  if (!nodes?.length) return
  const index = Array.from(nodes).indexOf(current)
  const next = nodes[index + direction]
  next?.focus()
}

interface MenuRowProps {
  label: string
  checked?: boolean
  disabled?: boolean
  title?: string
  /** 行右侧的附加内容（如测速结果），只读展示。 */
  trailing?: ReactNode
  onClick?: () => void
}

/** 统一的菜单行：动作项与节点行共用，保证文字左缘对齐。 */
const MenuRow = ({
  label,
  checked,
  disabled,
  title,
  trailing,
  onClick,
}: MenuRowProps) => (
  <button
    type="button"
    role="menuitem"
    data-policy-node
    disabled={disabled}
    onClick={onClick}
    onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        focusSibling(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
      }
    }}
    style={{
      gridTemplateColumns: `${MENU.checkCol}px minmax(0, 1fr) auto`,
      width: `calc(100% - ${MENU.inset * 2}px)`,
      marginLeft: MENU.inset,
      marginRight: MENU.inset,
      height: ROW_HEIGHT,
    }}
    className="group grid cursor-pointer appearance-none items-center rounded-[var(--radius-compact)] border-0 bg-transparent pr-2.5 pl-compact text-left text-[var(--color-text-primary)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-on-accent)] focus-visible:bg-[var(--color-accent)] focus-visible:text-[var(--color-text-on-accent)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-[0.45]"
  >
    <div className="flex items-center">
      {checked && <Check className="size-[14px]" />}
    </div>
    <p
      title={title}
      style={{ fontFamily: MENU_FONT }}
      className="truncate text-[13px] leading-none font-normal text-inherit antialiased"
    >
      {label}
    </p>
    {trailing != null && (
      <div className="flex items-center pl-component">{trailing}</div>
    )}
  </button>
)

/** 节点行右侧的只读测速结果：测速中 loading、已测出彩色毫秒值、未测过留空。 */
const NodeDelayHint = ({
  proxy,
  groupName,
}: {
  proxy: IProxyItem
  groupName: string
}) => {
  const { delayValue, isPreset, timeout } = useProxyDelayState(proxy, groupName)

  if (isPreset) return null
  if (delayValue === -2) return <BaseLoading />
  if (delayValue < 0) return null

  const colorVar = delayColorVar(
    delayManager.formatDelayColor(delayValue, timeout),
  )

  return (
    <span
      className="policy-delay-hint text-[11.5px] leading-none text-[var(--hint,var(--color-text-secondary))] group-hover:text-[var(--color-text-on-accent)] group-focus-visible:text-[var(--color-text-on-accent)]"
      style={
        {
          fontFamily: MENU_FONT,
          ...(colorVar ? { '--hint': colorVar } : {}),
        } as React.CSSProperties
      }
    >
      {delayManager.formatDelay(delayValue, timeout)}
    </span>
  )
}

/** macOS 菜单分隔线（hairline）。 */
const MenuSeparator = () => (
  <div className="mx-[9px] my-[5px] h-px flex-none bg-[var(--color-border)]" />
)

/** 列表溢出时顶部/底部的滚动指示箭头（对应原生菜单的 ⌃ / ⌄）。 */
const ScrollHint = ({ direction }: { direction: 'up' | 'down' }) => (
  <div
    className={cn(
      'pointer-events-none absolute right-0 left-0 flex h-4 items-center justify-center text-[var(--color-text-secondary)]',
      direction === 'up' ? 'top-0' : 'bottom-0',
    )}
    style={{
      background: `linear-gradient(${
        direction === 'up' ? 'to top' : 'to bottom'
      }, transparent, color-mix(in srgb, var(--color-bg-card) 92%, transparent))`,
    }}
  >
    {direction === 'up' ? (
      <ChevronUp className="size-[14px]" />
    ) : (
      <ChevronDown className="size-[14px]" />
    )}
  </div>
)

/**
 * Surge 风格的策略组菜单式浮层：顶部管理操作 + Benchmark，
 * 分隔线下是节点列表（当前节点打勾，点选即切换并关闭）。
 * 外观按 macOS 原生 NSMenu 像素规格实现（见 MENU 常量）。
 */
export const PolicyGroupPopover = ({
  anchorEl,
  position,
  group,
  readonly,
  canEdit,
  onClose,
  onSelect,
  onUpdated,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!group) return
    const defaultUrl =
      verge?.default_latency_test?.trim() ||
      'http://cp.cloudflare.com/generate_204'
    delayManager.setUrl(group.name, group.testUrl?.trim() || defaultUrl)
  }, [group, verge?.default_latency_test])

  const handleBenchmark = useCallback(async () => {
    if (!group || testing) return
    setTesting(true)
    const timeout = verge?.default_latency_timeout || 10000
    const url = delayManager.getUrl(group.name)
    try {
      await Promise.race([
        delayManager.checkListDelay(group.all, group.name, timeout),
        delayGroup(group.name, url, timeout),
      ])
      onUpdated()
    } finally {
      setTesting(false)
    }
  }, [group, onUpdated, testing, verge?.default_latency_timeout])

  const proxies = group?.all ?? []
  const listHeight =
    proxies.length === 0
      ? EMPTY_LIST_HEIGHT
      : Math.min(proxies.length * ROW_HEIGHT, MAX_LIST_HEIGHT)
  const overflow = proxies.length * ROW_HEIGHT > MAX_LIST_HEIGHT

  const [scrollHint, setScrollHint] = useState({ up: false, down: false })

  // 浮层重新打开或切换组时在渲染期重置滚动指示（React 官方推荐模式）。
  const listKey = `${group?.name ?? ''}|${anchorEl ? 1 : 0}|${overflow ? 1 : 0}`
  const [prevListKey, setPrevListKey] = useState(listKey)
  if (prevListKey !== listKey) {
    setPrevListKey(listKey)
    setScrollHint({ up: false, down: overflow })
  }

  const handleListScroll = useCallback((event: Event) => {
    const el = event.target as HTMLElement
    setScrollHint({
      up: el.scrollTop > 2,
      down: el.scrollTop + el.clientHeight < el.scrollHeight - 2,
    })
  }, [])

  const open = Boolean(anchorEl && group)

  // Radix Popover 通过虚拟锚点定位：右键给光标坐标（零尺寸矩形），键盘锚定卡片元素。
  const virtualRef = useMemo(() => {
    if (position) {
      const rect = new DOMRect(position.left, position.top, 0, 0)
      return { current: { getBoundingClientRect: () => rect } }
    }
    if (anchorEl) {
      return {
        current: {
          getBoundingClientRect: () => anchorEl.getBoundingClientRect(),
        },
      }
    }
    return { current: null }
  }, [position, anchorEl])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {virtualRef.current && <PopoverAnchor virtualRef={virtualRef as never} />}
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={position ? 0 : 6}
        style={{
          width: `min(${MENU.width}px, calc(100vw - 24px))`,
          maxHeight: 'min(560px, calc(100vh - 40px))',
          paddingTop: MENU.padY,
          paddingBottom: MENU.padY,
          backdropFilter: 'blur(50px) saturate(1.9)',
          WebkitBackdropFilter: 'blur(50px) saturate(1.9)',
        }}
        className="flex flex-col overflow-hidden rounded-[var(--radius-overlay)] border-[var(--color-border-strong)] bg-[color-mix(in_srgb,var(--color-bg-card)_82%,transparent)] px-0 text-[var(--color-text-primary)] shadow-[var(--shadow-dropdown)]"
      >
        {/* display: contents 让该层不参与布局，仅作为方向键导航的查找根。 */}
        <div data-policy-node-list className="contents">
          <div className="flex-none">
            {canEdit && group && (
              <>
                <MenuRow
                  label={t('proxies.page.menus.editGroup')}
                  onClick={() => onEdit(group)}
                />
                <MenuRow
                  label={t('proxies.page.menus.duplicate')}
                  onClick={() => onDuplicate(group)}
                />
                <MenuRow
                  label={t('proxies.page.menus.deleteGroup')}
                  onClick={() => onDelete(group)}
                />
                <MenuSeparator />
              </>
            )}
            <MenuRow
              label={t('proxies.page.menus.benchmark')}
              disabled={testing}
              onClick={() => void handleBenchmark()}
            />
          </div>

          <MenuSeparator />

          <div
            className="relative min-h-0 flex-initial"
            style={{ height: listHeight }}
          >
            {proxies.length === 0 ? (
              <BaseEmpty text={t('proxies.page.messages.noNodes')} />
            ) : (
              <>
                <div className="h-full [&>div::-webkit-scrollbar]:hidden [&>div]:[scrollbar-width:none]">
                  <VirtualList
                    count={proxies.length}
                    estimateSize={ROW_HEIGHT}
                    overscan={10}
                    getItemKey={(index) => proxies[index]?.name ?? index}
                    style={{ height: '100%' }}
                    onScroll={handleListScroll}
                    renderItem={(index) => {
                      const proxy = proxies[index]
                      if (!proxy || !group) return null
                      return (
                        <MenuRow
                          label={proxy.name}
                          title={proxy.name}
                          checked={proxy.name === group.now}
                          disabled={readonly}
                          trailing={
                            <NodeDelayHint
                              proxy={proxy}
                              groupName={group.name}
                            />
                          }
                          onClick={() => {
                            onSelect(group, proxy)
                            onClose()
                          }}
                        />
                      )
                    }}
                  />
                </div>
                {scrollHint.up && <ScrollHint direction="up" />}
                {scrollHint.down && <ScrollHint direction="down" />}
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
