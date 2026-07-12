import {
  CloseRounded,
  RefreshRounded,
  StorageOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  Typography,
  alpha,
  styled,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateRuleProvider } from 'tauri-plugin-mihomo-api'

import { RuleProviderDetailDialog } from '@/components/rule/rule-provider-detail-dialog'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import type { RuleProviderContent } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { getShellThemeVars } from '@/utils/shell-theme'

const MetaTag = styled(Box)<{ component?: React.ElementType }>(({ theme }) => ({
  display: 'inline-flex',
  height: 20,
  alignItems: 'center',
  borderRadius: 5,
  padding: '0 6px',
  backgroundColor: alpha(theme.palette.text.primary, 0.055),
  color: theme.palette.text.secondary,
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 1,
}))

export const ProviderButton = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { ruleProviders } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const contentCacheRef = useRef(new Map<string, RuleProviderContent>())
  const isUpdatingAny = Object.values(updating).some(Boolean)

  // 检查是否有提供者
  const hasProviders = Object.keys(ruleProviders || {}).length > 0

  // 更新单个规则提供者
  const updateProvider = useLockFn(async (name: string) => {
    try {
      // 设置更新状态
      setUpdating((prev) => ({ ...prev, [name]: true }))

      await updateRuleProvider(name)
      contentCacheRef.current.delete(name)

      // 刷新数据
      await refreshRules()
      await refreshRuleProviders()

      showNotice.success(
        'rules.feedback.notifications.provider.updateSuccess',
        {
          name,
        },
      )
    } catch (err) {
      showNotice.error('rules.feedback.notifications.provider.updateFailed', {
        name,
        message: String(err),
      })
    } finally {
      // 清除更新状态
      setUpdating((prev) => ({ ...prev, [name]: false }))
    }
  })

  // 更新所有规则提供者
  const updateAllProviders = useLockFn(async () => {
    try {
      // 获取所有provider的名称
      const allProviders = Object.keys(ruleProviders || {})
      if (allProviders.length === 0) {
        showNotice.info('rules.feedback.notifications.provider.none')
        return
      }

      // 设置所有provider为更新中状态
      const newUpdating = allProviders.reduce(
        (acc, key) => {
          acc[key] = true
          return acc
        },
        {} as Record<string, boolean>,
      )
      setUpdating(newUpdating)

      // 改为串行逐个更新所有provider
      for (const name of allProviders) {
        try {
          await updateRuleProvider(name)
          // 每个更新完成后更新状态
          setUpdating((prev) => ({ ...prev, [name]: false }))
        } catch (err) {
          console.error(`更新 ${name} 失败`, err)
          // 继续执行下一个，不中断整体流程
        }
      }

      contentCacheRef.current.clear()

      // 刷新数据
      await refreshRules()
      await refreshRuleProviders()

      showNotice.success('rules.feedback.notifications.provider.allUpdated')
    } catch (err) {
      showNotice.error('rules.feedback.notifications.provider.genericError', {
        message: String(err),
      })
    } finally {
      // 清除所有更新状态
      setUpdating({})
    }
  })

  const handleClose = () => {
    setSelectedProvider(null)
    contentCacheRef.current.clear()
    setOpen(false)
  }

  if (!hasProviders) return null

  return (
    <>
      <Button
        className="rule-provider-trigger"
        variant="text"
        size="small"
        startIcon={<StorageOutlined sx={{ fontSize: '20px !important' }} />}
        onClick={() => setOpen(true)}
        sx={{
          flex: '0 0 auto',
          height: 38,
          minWidth: 0,
          px: 1.5,
          borderRadius: 1.5,
          bgcolor: 'var(--shell-panel-muted)',
          color: 'text.primary',
          fontSize: 13.5,
          fontWeight: 550,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          textTransform: 'none',
          '& .MuiButton-startIcon': {
            mr: 1,
            ml: 0,
            color: 'text.secondary',
          },
          '&:hover': {
            bgcolor: 'var(--shell-nav-hover)',
          },
          '&:active': {
            bgcolor: 'var(--shell-nav-selected)',
          },
          '&:focus-visible': {
            outline: '2px solid var(--shell-focus) !important',
            outlineOffset: 1,
          },
        }}
      >
        {t('rules.page.provider.trigger')}
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth={false}
        slotProps={{
          paper: {
            sx: ({ palette }) => ({
              ...getShellThemeVars(palette),
              display: 'flex',
              width: 'min(640px, calc(100vw - 24px))',
              m: 1.5,
              maxHeight: 'calc(100% - 24px)',
              overflow: 'hidden',
              border: '1px solid var(--shell-border-strong) !important',
              borderRadius: 2,
              bgcolor: 'var(--shell-panel) !important',
              backgroundImage: 'none',
              boxShadow: 'var(--shell-shadow) !important',
            }),
          },
        }}
      >
        <DialogTitle sx={{ px: 2.5, pt: 2.25, pb: 1.75 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
              '@media (max-width: 520px)': {
                alignItems: 'flex-start',
              },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="h2"
                sx={{
                  minWidth: 0,
                  fontSize: 20,
                  fontWeight: 650,
                  lineHeight: 1.25,
                  letterSpacing: '-0.025em',
                }}
              >
                {t('rules.page.provider.dialogTitle')}
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                flex: '0 0 auto',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <Button
                variant="contained"
                size="small"
                loading={isUpdatingAny}
                disabled={isUpdatingAny}
                onClick={updateAllProviders}
                sx={{
                  minHeight: 32,
                  borderRadius: 1.25,
                  px: 1.25,
                  textTransform: 'none',
                  '&:focus-visible': {
                    outline: '2px solid var(--shell-focus) !important',
                    outlineOffset: 2,
                  },
                  '@media (max-width: 420px)': {
                    minWidth: 32,
                    px: 0.75,
                  },
                }}
              >
                {t('rules.page.provider.actions.updateAll')}
              </Button>
              <IconButton
                size="small"
                onClick={handleClose}
                aria-label={t('shared.actions.close')}
                title={t('shared.actions.close')}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'var(--shell-nav-hover)' },
                  '&:focus-visible': {
                    outline: '2px solid var(--shell-focus) !important',
                    outlineOffset: 1,
                  },
                }}
              >
                <CloseRounded fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent
          sx={{ minHeight: 0, overflowY: 'auto', px: 2.5, pt: 0, pb: 2.5 }}
        >
          <List
            sx={{
              minHeight: 120,
              overflow: 'hidden',
              border: '1px solid var(--shell-border)',
              borderRadius: 1.5,
              py: 0,
            }}
          >
            {Object.entries(ruleProviders || {})
              .sort()
              .map(([key, item]) => {
                const provider = item
                const time = dayjs(provider.updatedAt)
                const isUpdating = updating[key]

                return (
                  <ListItem
                    key={key}
                    disablePadding
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 44px',
                      minHeight: 64,
                      borderBottom: '1px solid var(--shell-border)',
                      '&:last-child': { borderBottom: 0 },
                    }}
                  >
                    <ButtonBase
                      onClick={() => setSelectedProvider(key)}
                      aria-label={t('rules.page.provider.detail.open', {
                        name: key,
                      })}
                      sx={({ palette }) => ({
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        minWidth: 0,
                        minHeight: 64,
                        alignItems: 'center',
                        columnGap: 1.5,
                        px: 2,
                        py: 1.25,
                        textAlign: 'left',
                        transition: 'background-color 160ms ease',
                        '&:hover': {
                          bgcolor: alpha(palette.text.primary, 0.055),
                        },
                        '&:focus-visible': {
                          outline: '2px solid var(--shell-focus)',
                          outlineOffset: -2,
                        },
                        '@media (max-width: 520px)': {
                          gridTemplateColumns: 'minmax(0, 1fr)',
                          rowGap: 0.75,
                          px: 1.5,
                        },
                      })}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          component="div"
                          noWrap
                          title={key}
                          sx={{
                            mb: 0.75,
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: 1.25,
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {key}
                        </Typography>
                        <Box
                          sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
                        >
                          <MetaTag component="span">
                            {provider.ruleCount}
                          </MetaTag>
                          <MetaTag component="span">
                            {provider.vehicleType}
                          </MetaTag>
                          <MetaTag component="span">
                            {provider.behavior}
                          </MetaTag>
                        </Box>
                      </Box>

                      <Typography
                        component="div"
                        color="text.secondary"
                        noWrap
                        title={`${t('shared.labels.updateAt')}: ${time.fromNow()}`}
                        sx={{ fontSize: 12, lineHeight: 1.4 }}
                      >
                        {t('shared.labels.updateAt')}: {time.fromNow()}
                      </Typography>
                    </ButtonBase>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => updateProvider(key)}
                        disabled={isUpdating}
                        aria-label={t('rules.page.provider.actions.update')}
                        sx={{
                          color: 'text.secondary',
                          animation: isUpdating
                            ? 'spin 1s linear infinite'
                            : 'none',
                          '&:hover': {
                            color: 'primary.main',
                            bgcolor: 'var(--shell-nav-hover)',
                          },
                          '&:focus-visible': {
                            outline: '2px solid var(--shell-focus) !important',
                            outlineOffset: 2,
                          },
                          '@keyframes spin': {
                            '0%': { transform: 'rotate(0deg)' },
                            '100%': { transform: 'rotate(360deg)' },
                          },
                        }}
                        title={t('rules.page.provider.actions.update')}
                      >
                        <RefreshRounded />
                      </IconButton>
                    </Box>
                  </ListItem>
                )
              })}
          </List>
        </DialogContent>
      </Dialog>

      <RuleProviderDetailDialog
        key={selectedProvider}
        open={selectedProvider !== null}
        providerName={selectedProvider}
        provider={
          selectedProvider ? ruleProviders?.[selectedProvider] : undefined
        }
        cache={contentCacheRef.current}
        onClose={() => setSelectedProvider(null)}
      />
    </>
  )
}
