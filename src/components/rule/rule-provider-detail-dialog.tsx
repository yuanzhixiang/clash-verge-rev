import {
  ArrowBackRounded,
  CloseRounded,
  SearchRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  alpha,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RuleProvider } from 'tauri-plugin-mihomo-api'

import {
  BaseEmpty,
  BaseLoading,
  BaseSearchBox,
  VirtualList,
} from '@/components/base'
import {
  getRuleProviderContent,
  type RuleProviderContent,
} from '@/services/cmds'
import { getShellThemeVars } from '@/utils/shell-theme'

interface Props {
  open: boolean
  providerName: string | null
  provider?: RuleProvider
  cache: Map<string, RuleProviderContent>
  onClose: () => void
}

const unavailableKey = (
  reason: Extract<RuleProviderContent, { status: 'unavailable' }>['reason'],
) => {
  switch (reason) {
    case 'mrs':
      return 'rules.page.provider.detail.unavailable.mrs' as const
    case 'cachePathUnavailable':
      return 'rules.page.provider.detail.unavailable.cachePathUnavailable' as const
    case 'cacheMissing':
      return 'rules.page.provider.detail.unavailable.cacheMissing' as const
  }
}

export const RuleProviderDetailDialog = ({
  open,
  providerName,
  provider,
  cache,
  onClose,
}: Props) => {
  const { t } = useTranslation()
  const [content, setContent] = useState<RuleProviderContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [match, setMatch] = useState(() => (_: string) => true)

  const load = useCallback(
    async (force = false) => {
      if (!providerName) return
      const cached = force ? undefined : cache.get(providerName)
      if (cached) {
        setContent(cached)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)
      setContent(null)
      try {
        const next = await getRuleProviderContent(providerName)
        cache.set(providerName, next)
        setContent(next)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [cache, providerName],
  )

  useEffect(() => {
    if (!open || !providerName) return
    void load()
  }, [load, open, providerName])

  const filteredRules = useMemo(() => {
    if (content?.status !== 'ready') return []
    return content.rules.flatMap((rule, index) =>
      match(rule) ? [{ index, rule }] : [],
    )
  }, [content, match])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: ({ palette }) => ({
            ...getShellThemeVars(palette),
            width: 'min(820px, calc(100vw - 24px))',
            height: 'min(720px, calc(100vh - 24px))',
            m: 1.5,
            overflow: 'hidden',
            border: '1px solid var(--shell-border-strong) !important',
            borderRadius: 'var(--radius-overlay)',
            bgcolor: 'var(--shell-panel) !important',
            backgroundImage: 'none',
            boxShadow: 'var(--shell-shadow) !important',
          }),
        },
      }}
    >
      <DialogTitle sx={{ px: { xs: 1.5, sm: 3 }, pt: 2.5, pb: 1.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label={t('rules.page.provider.detail.back')}
            title={t('rules.page.provider.detail.back')}
            sx={{ color: 'text.secondary' }}
          >
            <ArrowBackRounded fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component="h2"
              noWrap
              title={providerName || undefined}
              sx={{
                fontSize: 20,
                fontWeight: 650,
                lineHeight: 1.25,
                letterSpacing: '-0.025em',
              }}
            >
              {providerName}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{ mt: 0.25, fontSize: 11.5, lineHeight: 1.4 }}
            >
              {[provider?.format, provider?.behavior, provider?.ruleCount]
                .filter((value) => value != null)
                .join(' · ')}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label={t('shared.actions.close')}
            title={t('shared.actions.close')}
            sx={{ color: 'text.secondary' }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent
        sx={{
          display: 'flex',
          minHeight: 0,
          flexDirection: 'column',
          px: { xs: 1.5, sm: 3 },
          pt: 0,
          pb: 3,
        }}
      >
        {content?.status === 'ready' && (
          <Box sx={{ flex: '0 0 auto', mb: 1.5 }}>
            <BaseSearchBox
              placeholder={t('rules.page.provider.detail.searchPlaceholder')}
              startAdornment={
                <SearchRounded aria-hidden sx={{ fontSize: 18 }} />
              }
              onSearch={(nextMatch) => setMatch(() => nextMatch)}
            />
          </Box>
        )}

        <Box
          sx={{
            display: 'flex',
            minHeight: 0,
            flex: 1,
            overflow: 'hidden',
            border: '1px solid var(--shell-border)',
            borderRadius: 'var(--radius-container)',
          }}
        >
          {loading && (
            <Box sx={{ m: 'auto' }}>
              <BaseLoading />
            </Box>
          )}

          {!loading && error && (
            <BaseEmpty
              text={t('rules.page.provider.detail.loadFailed')}
              extra={
                <Button
                  size="small"
                  onClick={() => void load(true)}
                  sx={{ mt: 1, textTransform: 'none' }}
                >
                  {t('shared.actions.retry')}
                </Button>
              }
            />
          )}

          {!loading && content?.status === 'unavailable' && (
            <BaseEmpty text={t(unavailableKey(content.reason))} />
          )}

          {!loading &&
            content?.status === 'ready' &&
            filteredRules.length === 0 && (
              <BaseEmpty text={t('rules.page.provider.detail.empty')} />
            )}

          {!loading &&
            content?.status === 'ready' &&
            filteredRules.length > 0 && (
              <VirtualList
                count={filteredRules.length}
                estimateSize={34}
                overscan={12}
                getItemKey={(index) => filteredRules[index]?.index ?? index}
                style={{ flex: 1, minHeight: 0 }}
                renderItem={(index) => {
                  const item = filteredRules[index]
                  return (
                    <Box
                      sx={({ palette }) => ({
                        display: 'grid',
                        gridTemplateColumns: '54px minmax(0, 1fr)',
                        minHeight: 34,
                        alignItems: 'center',
                        bgcolor:
                          index % 2 === 0
                            ? 'transparent'
                            : alpha(palette.text.primary, 0.025),
                        '&:hover': {
                          bgcolor: alpha(palette.text.primary, 0.055),
                        },
                      })}
                    >
                      <Typography
                        color="text.secondary"
                        sx={{ px: 1.5, fontSize: 11, textAlign: 'right' }}
                      >
                        {(item?.index ?? index) + 1}
                      </Typography>
                      <Typography
                        component="code"
                        title={item?.rule}
                        sx={{
                          minWidth: 0,
                          overflow: 'hidden',
                          pr: 1.5,
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 12,
                          lineHeight: 1.5,
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item?.rule}
                      </Typography>
                    </Box>
                  )
                }}
              />
            )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
