import {
  CheckRounded,
  ContentCopyRounded,
  DeleteOutlineRounded,
  EditRounded,
  NetworkCheckRounded,
} from '@mui/icons-material'
import {
  Box,
  ButtonBase,
  Divider,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Popover,
  Typography,
  alpha,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { delayGroup } from 'tauri-plugin-mihomo-api'

import { BaseEmpty, VirtualList } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import delayManager from '@/services/delay'
import { getShellThemeVars } from '@/utils/shell-theme'

import { PolicyDelayLabel } from './policy-card'

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

const ROW_HEIGHT = 40
const MAX_LIST_HEIGHT = 400

const focusSibling = (current: HTMLElement, direction: 1 | -1) => {
  const root = current.closest('[data-policy-node-list]')
  const nodes = root?.querySelectorAll<HTMLElement>('[data-policy-node]')
  if (!nodes?.length) return
  const index = Array.from(nodes).indexOf(current)
  const next = nodes[index + direction]
  next?.focus()
}

/**
 * Surge 风格的策略组菜单式浮层：顶部管理操作 + Benchmark，
 * 分隔线下是节点列表（当前节点打勾，点选即切换并关闭）。
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
  const listHeight = Math.min(
    Math.max(proxies.length, 1) * ROW_HEIGHT,
    MAX_LIST_HEIGHT,
  )

  return (
    <Popover
      open={Boolean(anchorEl && group)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: ({ palette }) => ({
            ...getShellThemeVars(palette),
            display: 'flex',
            width: 'min(320px, calc(100vw - 24px))',
            maxHeight: 'min(560px, calc(100vh - 40px))',
            mt: 0.75,
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid var(--shell-border-strong) !important',
            borderRadius: 'var(--radius-overlay)',
            bgcolor: 'var(--shell-panel) !important',
            backgroundImage: 'none',
            boxShadow: 'var(--shell-shadow) !important',
            '&:focus, &:focus-visible': { outline: 'none !important' },
          }),
        },
      }}
    >
      <MenuList dense sx={{ py: 0.5, flex: '0 0 auto' }}>
        {canEdit && group && (
          <MenuItem onClick={() => onEdit(group)}>
            <ListItemIcon>
              <EditRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('proxies.page.menus.editGroup')}</ListItemText>
          </MenuItem>
        )}
        {canEdit && group && (
          <MenuItem onClick={() => onDuplicate(group)}>
            <ListItemIcon>
              <ContentCopyRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('proxies.page.menus.duplicate')}</ListItemText>
          </MenuItem>
        )}
        {canEdit && group && (
          <MenuItem
            onClick={() => onDelete(group)}
            sx={({ palette }) => ({ color: palette.error.main })}
          >
            <ListItemIcon>
              <DeleteOutlineRounded fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>{t('proxies.page.menus.deleteGroup')}</ListItemText>
          </MenuItem>
        )}
        {canEdit && group && <Divider sx={{ my: 0.5 }} />}
        <MenuItem disabled={testing} onClick={() => void handleBenchmark()}>
          <ListItemIcon>
            <NetworkCheckRounded
              fontSize="small"
              sx={{
                animation: testing ? 'policy-spin 1s linear infinite' : 'none',
              }}
            />
          </ListItemIcon>
          <ListItemText>{t('proxies.page.menus.benchmark')}</ListItemText>
        </MenuItem>
      </MenuList>

      <Divider />

      <Box
        data-policy-node-list
        sx={{ minHeight: 0, flex: '0 1 auto', height: listHeight }}
      >
        {proxies.length === 0 ? (
          <BaseEmpty text={t('proxies.page.messages.noNodes')} />
        ) : (
          <VirtualList
            count={proxies.length}
            estimateSize={ROW_HEIGHT}
            overscan={10}
            getItemKey={(index) => proxies[index]?.name ?? index}
            style={{ height: '100%' }}
            renderItem={(index) => {
              const proxy = proxies[index]
              if (!proxy || !group) return null
              const selected = proxy.name === group.now
              return (
                <Box
                  sx={({ palette }) => ({
                    display: 'grid',
                    width: '100%',
                    minHeight: ROW_HEIGHT,
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'stretch',
                    bgcolor: selected
                      ? alpha(palette.primary.main, 0.1)
                      : 'transparent',
                  })}
                >
                  <ButtonBase
                    data-policy-node
                    disabled={readonly}
                    onClick={() => {
                      onSelect(group, proxy)
                      onClose()
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'ArrowDown' ||
                        event.key === 'ArrowUp'
                      ) {
                        event.preventDefault()
                        focusSibling(
                          event.currentTarget,
                          event.key === 'ArrowDown' ? 1 : -1,
                        )
                      }
                    }}
                    sx={{
                      display: 'grid',
                      minWidth: 0,
                      gridTemplateColumns: '22px minmax(0, 1fr)',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      textAlign: 'left',
                      '&:hover': { bgcolor: 'var(--shell-nav-hover)' },
                      '&.Mui-disabled': {
                        color: 'text.primary',
                        opacity: 0.72,
                      },
                    }}
                  >
                    <Box sx={{ color: 'primary.main' }}>
                      {selected && <CheckRounded sx={{ fontSize: 17 }} />}
                    </Box>
                    <Typography
                      noWrap
                      title={proxy.name}
                      sx={{
                        fontSize: 13.5,
                        fontWeight: selected ? 600 : 450,
                      }}
                    >
                      {proxy.name}
                    </Typography>
                  </ButtonBase>
                  <Box sx={{ display: 'flex', alignItems: 'center', pr: 1.5 }}>
                    <PolicyDelayLabel
                      proxy={proxy}
                      groupName={group.name}
                      testLabel={t('proxies.page.actions.test')}
                    />
                  </Box>
                </Box>
              )
            }}
          />
        )}
      </Box>
      <style>
        {`@keyframes policy-spin { to { transform: rotate(360deg); } }`}
      </style>
    </Popover>
  )
}
