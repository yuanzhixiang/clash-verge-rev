import {
  CheckRounded,
  KeyboardArrowDownRounded,
  KeyboardArrowUpRounded,
} from '@mui/icons-material'
import { Box, ButtonBase, Popover, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { delayGroup } from 'tauri-plugin-mihomo-api'

import { BaseEmpty, VirtualList } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import delayManager from '@/services/delay'

interface Props {
  anchorEl: HTMLElement | null
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

/** macOS 原生 NSMenu 的像素规格，对照 Surge 截图取值，可在此微调。 */
const MENU = {
  width: 300,
  radius: 10,
  padY: 5,
  rowHeight: 24,
  fontSize: 13,
  inset: 5,
  highlightRadius: 5,
  checkCol: 17,
  highlight: { light: '#3574F6', dark: '#3E71DE' },
  text: { light: 'rgba(0, 0, 0, 0.88)', dark: 'rgba(255, 255, 255, 0.92)' },
  panel: { light: 'rgba(242, 242, 242, 0.82)', dark: 'rgba(44, 44, 46, 0.80)' },
  border: { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.16)' },
  separator: {
    light: 'rgba(0, 0, 0, 0.10)',
    dark: 'rgba(255, 255, 255, 0.15)',
  },
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
  onClick?: () => void
}

/** 统一的菜单行：动作项与节点行共用，保证文字左缘对齐。 */
const MenuRow = ({
  label,
  checked,
  disabled,
  title,
  onClick,
}: MenuRowProps) => (
  <ButtonBase
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
    sx={({ palette }) => {
      const mode = palette.mode === 'dark' ? 'dark' : 'light'
      return {
        display: 'grid',
        gridTemplateColumns: `${MENU.checkCol}px minmax(0, 1fr)`,
        alignItems: 'center',
        width: `calc(100% - ${MENU.inset * 2}px)`,
        height: ROW_HEIGHT,
        mx: `${MENU.inset}px`,
        borderRadius: `${MENU.highlightRadius}px`,
        pl: '6px',
        pr: '10px',
        textAlign: 'left',
        color: MENU.text[mode],
        '&:hover, &.Mui-focusVisible': {
          bgcolor: MENU.highlight[mode],
          color: '#fff',
        },
        '&.Mui-disabled': { opacity: 0.45 },
      }
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      {checked && <CheckRounded sx={{ fontSize: 14 }} />}
    </Box>
    <Typography
      noWrap
      title={title}
      sx={{
        fontSize: MENU.fontSize,
        fontWeight: 400,
        lineHeight: 1,
        fontFamily: MENU_FONT,
        WebkitFontSmoothing: 'antialiased',
        color: 'inherit',
      }}
    >
      {label}
    </Typography>
  </ButtonBase>
)

/** macOS 菜单分隔线（hairline）。 */
const MenuSeparator = () => (
  <Box
    sx={({ palette }) => ({
      flex: '0 0 auto',
      height: '1px',
      mx: '9px',
      my: '5px',
      bgcolor: MENU.separator[palette.mode === 'dark' ? 'dark' : 'light'],
    })}
  />
)

/** 列表溢出时顶部/底部的滚动指示箭头（对应原生菜单的 ⌃ / ⌄）。 */
const ScrollHint = ({ direction }: { direction: 'up' | 'down' }) => (
  <Box
    sx={({ palette }) => {
      const dark = palette.mode === 'dark'
      const bg = dark ? 'rgba(44, 44, 46, 0.92)' : 'rgba(242, 242, 242, 0.92)'
      return {
        position: 'absolute',
        left: 0,
        right: 0,
        [direction === 'up' ? 'top' : 'bottom']: 0,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        background: `linear-gradient(${direction === 'up' ? 'to top' : 'to bottom'}, transparent, ${bg})`,
        color: dark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.55)',
      }
    }}
  >
    {direction === 'up' ? (
      <KeyboardArrowUpRounded sx={{ fontSize: 14 }} />
    ) : (
      <KeyboardArrowDownRounded sx={{ fontSize: 14 }} />
    )}
  </Box>
)

/**
 * Surge 风格的策略组菜单式浮层：顶部管理操作 + Benchmark，
 * 分隔线下是节点列表（当前节点打勾，点选即切换并关闭）。
 * 外观按 macOS 原生 NSMenu 像素规格实现（见 MENU 常量）。
 */
export const PolicyGroupPopover = ({
  anchorEl,
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

  return (
    <Popover
      open={Boolean(anchorEl && group)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: ({ palette }) => {
            const mode = palette.mode === 'dark' ? 'dark' : 'light'
            return {
              display: 'flex',
              flexDirection: 'column',
              width: `min(${MENU.width}px, calc(100vw - 24px))`,
              maxHeight: 'min(560px, calc(100vh - 40px))',
              mt: 0.75,
              py: `${MENU.padY}px`,
              overflow: 'hidden',
              borderRadius: `${MENU.radius}px`,
              border: `1px solid ${MENU.border[mode]} !important`,
              bgcolor: `${MENU.panel[mode]} !important`,
              backgroundImage: 'none',
              backdropFilter: 'blur(50px) saturate(1.9)',
              WebkitBackdropFilter: 'blur(50px) saturate(1.9)',
              boxShadow:
                mode === 'dark'
                  ? '0 10px 34px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3) !important'
                  : '0 10px 34px rgba(0, 0, 0, 0.26), 0 2px 8px rgba(0, 0, 0, 0.12) !important',
              '&:focus, &:focus-visible': { outline: 'none !important' },
            }
          },
        },
      }}
    >
      {/* display: contents 让该层不参与布局，仅作为方向键导航的查找根。 */}
      <Box data-policy-node-list sx={{ display: 'contents' }}>
        <Box sx={{ flex: '0 0 auto' }}>
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
        </Box>

        <MenuSeparator />

        <Box
          sx={{
            position: 'relative',
            minHeight: 0,
            flex: '0 1 auto',
            height: listHeight,
          }}
        >
          {proxies.length === 0 ? (
            <BaseEmpty text={t('proxies.page.messages.noNodes')} />
          ) : (
            <>
              <Box
                sx={{
                  height: '100%',
                  '& > div': { scrollbarWidth: 'none' },
                  '& > div::-webkit-scrollbar': { display: 'none' },
                }}
              >
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
                        onClick={() => {
                          onSelect(group, proxy)
                          onClose()
                        }}
                      />
                    )
                  }}
                />
              </Box>
              {scrollHint.up && <ScrollHint direction="up" />}
              {scrollHint.down && <ScrollHint direction="down" />}
            </>
          )}
        </Box>
      </Box>
    </Popover>
  )
}
