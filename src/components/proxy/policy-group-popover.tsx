import {
  AccessTimeRounded,
  CheckRounded,
  CloseRounded,
  NetworkCheckRounded,
  SearchRounded,
  SortByAlphaRounded,
  SortRounded,
  VisibilityOffRounded,
  VisibilityRounded,
} from '@mui/icons-material'
import {
  Box,
  ButtonBase,
  IconButton,
  Popover,
  Typography,
  alpha,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { delayGroup } from 'tauri-plugin-mihomo-api'

import { BaseEmpty, BaseSearchBox, VirtualList } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import delayManager from '@/services/delay'
import { getShellThemeVars } from '@/utils/shell-theme'

import { PolicyDelayLabel } from './policy-card'
import { filterSort, type ProxySortType } from './use-filter-sort'

interface Props {
  anchorEl: HTMLElement | null
  group: IProxyGroupItem | null
  readonly: boolean
  onClose: () => void
  onSelect: (group: IProxyGroupItem, proxy: IProxyItem) => void
  onUpdated: () => void
}

const focusSibling = (current: HTMLElement, direction: 1 | -1) => {
  const root = current.closest('[data-policy-node-list]')
  const nodes = root?.querySelectorAll<HTMLElement>('[data-policy-node]')
  if (!nodes?.length) return
  const index = Array.from(nodes).indexOf(current)
  const next = nodes[index + direction]
  next?.focus()
}

export const PolicyGroupPopover = ({
  anchorEl,
  group,
  readonly,
  onClose,
  onSelect,
  onUpdated,
}: Props) => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const [filter, setFilter] = useState(() => (_: string) => true)
  const [sortType, setSortType] = useState<ProxySortType>(0)
  const [showDetails, setShowDetails] = useState(true)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!group) return
    const defaultUrl =
      verge?.default_latency_test?.trim() ||
      'http://cp.cloudflare.com/generate_204'
    delayManager.setUrl(group.name, group.testUrl?.trim() || defaultUrl)
  }, [group, verge?.default_latency_test])

  const proxies = useMemo(() => {
    if (!group) return []
    const filtered = group.all.filter((proxy) => filter(proxy.name))
    return filterSort(
      filtered,
      group.name,
      '',
      sortType,
      verge?.default_latency_timeout,
    )
  }, [filter, group, sortType, verge?.default_latency_timeout])

  const handleTestAll = useCallback(async () => {
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

  const cycleSort = () => {
    setSortType((current) => ((current + 1) % 3) as ProxySortType)
  }

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
            width: 'min(420px, calc(100vw - 24px))',
            height: 'min(520px, calc(100vh - 40px))',
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          pt: 1.75,
          pb: 1.25,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            noWrap
            title={group?.name}
            sx={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.015em' }}
          >
            {group?.name}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.25, fontSize: 11.5 }}>
            {group?.type} · {group?.all.length ?? 0}
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={t('shared.actions.close')}
          title={t('shared.actions.close')}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ px: 2, pb: 1.25 }}>
        <BaseSearchBox
          placeholder={t('proxies.page.placeholders.searchNodes')}
          startAdornment={<SearchRounded aria-hidden sx={{ fontSize: 18 }} />}
          onSearch={(nextFilter) => setFilter(() => nextFilter)}
          sx={{
            '& .MuiOutlinedInput-root': {
              height: 36,
              borderRadius: 'var(--radius-pill)',
              bgcolor: 'var(--shell-panel-muted)',
              '& fieldset': { borderColor: 'var(--shell-border)' },
            },
            '& .MuiInputBase-input': { fontSize: 13 },
          }}
        />
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          borderBlock: '1px solid var(--shell-border)',
          px: 1.5,
          py: 0.75,
          bgcolor: 'var(--shell-panel-muted)',
        }}
      >
        <IconButton
          size="small"
          disabled={testing}
          onClick={() => void handleTestAll()}
          aria-label={t('proxies.page.actions.testAll')}
          title={t('proxies.page.actions.testAll')}
        >
          <NetworkCheckRounded
            fontSize="small"
            sx={{
              animation: testing ? 'policy-spin 1s linear infinite' : 'none',
            }}
          />
        </IconButton>
        <IconButton
          size="small"
          onClick={cycleSort}
          aria-label={
            [
              t('proxies.page.tooltips.sortDefault'),
              t('proxies.page.tooltips.sortDelay'),
              t('proxies.page.tooltips.sortName'),
            ][sortType]
          }
          title={
            [
              t('proxies.page.tooltips.sortDefault'),
              t('proxies.page.tooltips.sortDelay'),
              t('proxies.page.tooltips.sortName'),
            ][sortType]
          }
        >
          {sortType === 0 && <SortRounded fontSize="small" />}
          {sortType === 1 && <AccessTimeRounded fontSize="small" />}
          {sortType === 2 && <SortByAlphaRounded fontSize="small" />}
        </IconButton>
        <IconButton
          size="small"
          onClick={() => setShowDetails((current) => !current)}
          aria-label={
            showDetails
              ? t('proxies.page.tooltips.showBasic')
              : t('proxies.page.tooltips.showDetail')
          }
          title={
            showDetails
              ? t('proxies.page.tooltips.showBasic')
              : t('proxies.page.tooltips.showDetail')
          }
        >
          {showDetails ? (
            <VisibilityRounded fontSize="small" />
          ) : (
            <VisibilityOffRounded fontSize="small" />
          )}
        </IconButton>
        {readonly && (
          <Typography
            color="text.secondary"
            sx={{ ml: 'auto', fontSize: 11.5 }}
          >
            {t('proxies.page.labels.readonlyGroup')}
          </Typography>
        )}
      </Box>

      <Box
        data-policy-node-list
        sx={{ minHeight: 0, flex: 1, overflow: 'hidden' }}
      >
        {proxies.length === 0 ? (
          <BaseEmpty text={t('proxies.page.messages.noNodes')} />
        ) : (
          <VirtualList
            count={proxies.length}
            estimateSize={showDetails ? 58 : 44}
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
                    minHeight: showDetails ? 58 : 44,
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'stretch',
                    borderBottom: '1px solid var(--shell-border)',
                    bgcolor: selected
                      ? alpha(palette.primary.main, 0.1)
                      : 'transparent',
                  })}
                >
                  <ButtonBase
                    data-policy-node
                    disabled={readonly}
                    onClick={() => onSelect(group, proxy)}
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
                      px: 2,
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
                    <Box sx={{ minWidth: 0 }}>
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
                      {showDetails && (
                        <Typography
                          color="text.secondary"
                          noWrap
                          sx={{ mt: 0.25, fontSize: 11 }}
                        >
                          {[proxy.type, proxy.provider]
                            .filter(Boolean)
                            .join(' · ')}
                        </Typography>
                      )}
                    </Box>
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
