import { RefreshRounded, StorageOutlined } from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
  alpha,
  styled,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateRuleProvider } from 'tauri-plugin-mihomo-api'

import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'
import { getShellThemeVars } from '@/utils/shell-theme'

// 辅助组件 - 类型框
const TypeBox = styled(Box)<{ component?: React.ElementType }>(({ theme }) => ({
  display: 'inline-block',
  border: '1px solid #ccc',
  borderColor: alpha(theme.palette.secondary.main, 0.5),
  color: alpha(theme.palette.secondary.main, 0.8),
  borderRadius: 4,
  fontSize: 10,
  marginRight: '4px',
  padding: '0 2px',
  lineHeight: 1.25,
}))

export const ProviderButton = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { ruleProviders } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const isUpdatingAny = Object.values(updating).some(Boolean)

  // 检查是否有提供者
  const hasProviders = Object.keys(ruleProviders || {}).length > 0

  // 更新单个规则提供者
  const updateProvider = useLockFn(async (name: string) => {
    try {
      // 设置更新状态
      setUpdating((prev) => ({ ...prev, [name]: true }))

      await updateRuleProvider(name)

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
    setOpen(false)
  }

  if (!hasProviders) return null

  return (
    <>
      <Button
        variant="text"
        size="small"
        startIcon={<StorageOutlined />}
        onClick={() => setOpen(true)}
        sx={{
          minHeight: 36,
          borderRadius: 1.25,
          bgcolor: 'var(--shell-panel-muted)',
          color: 'text.primary',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          textTransform: 'none',
          '&:hover': {
            bgcolor: 'var(--shell-nav-hover)',
          },
          '&:focus-visible': {
            outline: '2px solid var(--shell-focus) !important',
            outlineOffset: 2,
          },
        }}
      >
        {t('rules.page.provider.trigger')}
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: ({ palette }) => ({
              ...getShellThemeVars(palette),
              display: 'flex',
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
        <DialogTitle sx={{ px: 2.5, pt: 2.25, pb: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1.5,
              '@media (max-width: 520px)': {
                alignItems: 'stretch',
                flexDirection: 'column',
              },
            }}
          >
            <Typography variant="h6">
              {t('rules.page.provider.dialogTitle')}
            </Typography>
            <Button
              variant="contained"
              size="small"
              loading={isUpdatingAny}
              disabled={isUpdatingAny}
              onClick={updateAllProviders}
              sx={{
                borderRadius: 1.25,
                textTransform: 'none',
                '&:focus-visible': {
                  outline: '2px solid var(--shell-focus) !important',
                  outlineOffset: 2,
                },
              }}
            >
              {t('rules.page.provider.actions.updateAll')}
            </Button>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ minHeight: 0, overflowY: 'auto', px: 2.5, py: 1 }}>
          <List sx={{ py: 0, minHeight: 180 }}>
            {Object.entries(ruleProviders || {})
              .sort()
              .map(([key, item]) => {
                const provider = item
                const time = dayjs(provider.updatedAt)
                const isUpdating = updating[key]

                return (
                  <ListItem
                    key={key}
                    sx={({ palette }) => ({
                      p: 0,
                      mb: 1,
                      overflow: 'hidden',
                      border: '1px solid var(--shell-border)',
                      borderRadius: 1.5,
                      bgcolor: 'var(--shell-panel-muted)',
                      transition:
                        'background-color 160ms ease, border-color 160ms ease',
                      '&:hover': {
                        bgcolor: alpha(palette.text.primary, 0.055),
                        borderColor: 'var(--shell-border-strong)',
                      },
                    })}
                  >
                    <ListItemText
                      sx={{ px: 2, py: 1 }}
                      slotProps={{ secondary: { component: 'div' } }}
                      primary={
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Typography
                            variant="subtitle1"
                            component="div"
                            noWrap
                            title={key}
                            sx={{ display: 'flex', alignItems: 'center' }}
                          >
                            <span style={{ marginRight: '8px' }}>{key}</span>
                            <TypeBox component="span">
                              {provider.ruleCount}
                            </TypeBox>
                          </Typography>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                          >
                            <small>{t('shared.labels.updateAt')}: </small>
                            {time.fromNow()}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex' }}>
                          <TypeBox component="span">
                            {provider.vehicleType}
                          </TypeBox>
                          <TypeBox component="span">
                            {provider.behavior}
                          </TypeBox>
                        </Box>
                      }
                    />
                    <Divider orientation="vertical" flexItem />
                    <Box
                      sx={{
                        width: 40,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => updateProvider(key)}
                        disabled={isUpdating}
                        aria-label={t('rules.page.provider.actions.update')}
                        sx={{
                          animation: isUpdating
                            ? 'spin 1s linear infinite'
                            : 'none',
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

        <DialogActions
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: '1px solid var(--shell-border)',
          }}
        >
          <Button
            onClick={handleClose}
            variant="outlined"
            sx={{
              borderColor: 'var(--shell-border-strong)',
              borderRadius: 1.25,
              color: 'text.primary',
              textTransform: 'none',
              '&:focus-visible': {
                outline: '2px solid var(--shell-focus) !important',
                outlineOffset: 2,
              },
            }}
          >
            {t('shared.actions.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
