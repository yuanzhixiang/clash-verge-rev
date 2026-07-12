import {
  CloseRounded,
  RefreshRounded,
  StorageOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  Typography,
  alpha,
  styled,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateProxyProvider } from 'tauri-plugin-mihomo-api'

import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'
import parseTraffic from '@/utils/parse-traffic'
import { getShellThemeVars } from '@/utils/shell-theme'

const TypeBox = styled(Box)<{ component?: React.ElementType }>(({ theme }) => ({
  display: 'inline-flex',
  height: 20,
  alignItems: 'center',
  borderRadius: 'var(--radius-compact)',
  padding: '0 6px',
  backgroundColor: alpha(theme.palette.text.primary, 0.055),
  color: theme.palette.text.secondary,
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 1,
}))

// 解析过期时间
const parseExpire = (expire?: number) => {
  if (!expire) return '-'
  return dayjs(expire * 1000).format('YYYY-MM-DD')
}

export const ProviderButton = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { proxyProviders } = useProxiesData()
  const { refreshProxy, refreshProxyProviders } = useAppRefreshers()
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const isUpdatingAny = Object.values(updating).some(Boolean)

  useEffect(() => {
    refreshProxyProviders().catch(() => {})
  }, [refreshProxyProviders])

  // 检查是否有提供者
  const hasProviders = Object.keys(proxyProviders || {}).length > 0

  // 更新单个代理提供者
  const updateProvider = useLockFn(async (name: string) => {
    try {
      // 设置更新状态
      setUpdating((prev) => ({ ...prev, [name]: true }))

      await updateProxyProvider(name)

      // 刷新数据
      await refreshProxy()
      await refreshProxyProviders()

      showNotice.success(
        'proxies.feedback.notifications.provider.updateSuccess',
        {
          name,
        },
      )
    } catch (err) {
      showNotice.error('proxies.feedback.notifications.provider.updateFailed', {
        name,
        message: String(err),
      })
    } finally {
      // 清除更新状态
      setUpdating((prev) => ({ ...prev, [name]: false }))
    }
  })

  // 更新所有代理提供者
  const updateAllProviders = useLockFn(async () => {
    try {
      // 获取所有provider的名称
      const allProviders = Object.keys(proxyProviders || {})
      if (allProviders.length === 0) {
        showNotice.info('proxies.feedback.notifications.provider.none')
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
          await updateProxyProvider(name)
          // 每个更新完成后更新状态
          setUpdating((prev) => ({ ...prev, [name]: false }))
        } catch (err) {
          console.error(`更新 ${name} 失败`, err)
          // 继续执行下一个，不中断整体流程
        }
      }

      // 刷新数据
      await refreshProxy()
      await refreshProxyProviders()

      showNotice.success('proxies.feedback.notifications.provider.allUpdated')
    } catch (err) {
      showNotice.error('proxies.feedback.notifications.provider.genericError', {
        message: String(err),
      })
    } finally {
      // 清除所有更新状态
      setUpdating({})
    }
  })

  const handleClose = () => {
    setOpen(false)
  }

  if (!hasProviders) return null

  return (
    <>
      <Button
        className="proxy-provider-trigger"
        variant="text"
        size="small"
        startIcon={<StorageOutlined sx={{ fontSize: '20px !important' }} />}
        onClick={() => setOpen(true)}
        sx={{
          flex: '0 0 auto',
          height: 36,
          minWidth: 0,
          px: 1.5,
          borderRadius: 'var(--radius-control)',
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
          '&:hover': { bgcolor: 'var(--shell-nav-hover)' },
          '&:active': { bgcolor: 'var(--shell-nav-selected)' },
          '&:focus-visible': {
            outline: '2px solid var(--shell-focus) !important',
            outlineOffset: 1,
          },
        }}
      >
        {t('proxies.page.provider.title')}
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
              width: 'min(680px, calc(100vw - 24px))',
              m: 1.5,
              maxHeight: 'calc(100% - 24px)',
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
        <DialogTitle sx={{ px: 3, pt: 2.75, pb: 2 }}>
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
              {t('proxies.page.provider.title')}
            </Typography>
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
                aria-label={t('proxies.page.provider.actions.updateAll')}
                sx={{
                  minHeight: 32,
                  borderRadius: 'var(--radius-compact)',
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
                {t('proxies.page.provider.actions.updateAll')}
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
          sx={{ minHeight: 0, overflowY: 'auto', px: 3, pt: 0, pb: 3 }}
        >
          <List
            sx={{
              overflow: 'hidden',
              border: '1px solid var(--shell-border)',
              borderRadius: 'var(--radius-container)',
              py: 0,
            }}
          >
            {Object.entries(proxyProviders || {})
              .sort()
              .map(([key, item]) => {
                const provider = item
                const time = dayjs(provider.updatedAt)
                const isUpdating = updating[key]

                // 订阅信息
                const sub = provider.subscriptionInfo
                const hasSubInfo = !!sub
                const upload = sub?.Upload || 0
                const download = sub?.Download || 0
                const total = sub?.Total || 0
                const expire = sub?.Expire || 0

                // 流量使用进度
                const progress =
                  total > 0
                    ? Math.min(
                        Math.round(((download + upload) * 100) / total) + 1,
                        100,
                      )
                    : 0

                return (
                  <ListItem
                    key={key}
                    disablePadding
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 44px',
                      minHeight: hasSubInfo ? 92 : 64,
                      borderBottom: '1px solid var(--shell-border)',
                      '&:last-child': { borderBottom: 0 },
                    }}
                  >
                    <Box
                      sx={({ palette }) => ({
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        minWidth: 0,
                        minHeight: 'inherit',
                        alignItems: 'center',
                        columnGap: 1.5,
                        px: 2,
                        py: 1.25,
                        textAlign: 'left',
                        transition: 'background-color 160ms ease',
                        '&:hover': {
                          bgcolor: alpha(palette.text.primary, 0.045),
                        },
                        '@media (max-width: 520px)': {
                          gridTemplateColumns: 'minmax(0, 1fr)',
                          rowGap: 0.75,
                          px: 1.5,
                        },
                      })}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            minWidth: 0,
                            flexWrap: 'wrap',
                            gap: 0.5,
                          }}
                        >
                          <Typography
                            component="div"
                            noWrap
                            title={key}
                            sx={{
                              minWidth: 0,
                              mb: 0.75,
                              flexBasis: '100%',
                              fontSize: 14,
                              fontWeight: 600,
                              lineHeight: 1.25,
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {key}
                          </Typography>
                          <TypeBox component="span">
                            {provider.proxies.length}
                          </TypeBox>
                          <TypeBox component="span">
                            {provider.vehicleType}
                          </TypeBox>
                        </Box>

                        {hasSubInfo && (
                          <Box sx={{ mt: 1.25 }}>
                            <Box
                              sx={{
                                mb: 0.75,
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 2,
                                color: 'text.secondary',
                                fontSize: 11.5,
                              }}
                            >
                              <span
                                title={t('shared.labels.usedTotal') as string}
                              >
                                {parseTraffic(upload + download)} /{' '}
                                {parseTraffic(total)}
                              </span>
                              <span
                                title={t('shared.labels.expireTime') as string}
                              >
                                {parseExpire(expire)}
                              </span>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={progress}
                              sx={({ palette }) => ({
                                height: 4,
                                borderRadius: 'var(--radius-pill)',
                                opacity: total > 0 ? 1 : 0,
                                bgcolor: alpha(palette.text.primary, 0.07),
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 'var(--radius-pill)',
                                },
                              })}
                            />
                          </Box>
                        )}
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
                    </Box>
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
                        title={t('proxies.page.provider.actions.update')}
                        aria-label={t('proxies.page.provider.actions.update')}
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
    </>
  )
}
