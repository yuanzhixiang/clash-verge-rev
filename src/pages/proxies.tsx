import {
  AltRouteRounded,
  LanOutlined,
  LanRounded,
  PublicRounded,
  SettingsEthernetRounded,
  WarningRounded,
} from '@mui/icons-material'
import { Box, Button, Typography } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import { BasePage, TooltipIcon } from '@/components/base'
import { PolicyDashboard } from '@/components/proxy/policy-dashboard'
import { ProxyGroups } from '@/components/proxy/proxy-groups'
import { useVerge } from '@/hooks/use-verge'
import {
  useAppRefreshers,
  useClashConfigData,
} from '@/providers/app-data-context'
import {
  getRuntimeProxyChainConfig,
  patchClashMode,
  updateProxyChainConfigInRuntime,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { debugLog } from '@/utils/debug'

const MODES = ['direct', 'global', 'rule'] as const
type Mode = (typeof MODES)[number]
const MODE_SET = new Set<string>(MODES)
const MODE_ICONS: Record<Mode, typeof AltRouteRounded> = {
  direct: SettingsEthernetRounded,
  global: PublicRounded,
  rule: AltRouteRounded,
}
const isMode = (value: unknown): value is Mode =>
  typeof value === 'string' && MODE_SET.has(value)

const ProxyPage = () => {
  const { t } = useTranslation()

  // 从 localStorage 恢复链式代理按钮状态
  const [isChainMode, setIsChainMode] = useState(() => {
    try {
      const saved = localStorage.getItem('proxy-chain-mode-enabled')
      return saved === 'true'
    } catch {
      return false
    }
  })

  const [chainConfigData, dispatchChainConfigData] = useReducer(
    (_: string | null, action: string | null) => action,
    null as string | null,
  )

  const { clashConfig } = useClashConfigData()
  const { refreshClashConfig } = useAppRefreshers()

  const updateChainConfigData = useCallback((value: string | null) => {
    dispatchChainConfigData(value)
  }, [])
  const { verge } = useVerge()

  const normalizedMode = clashConfig?.mode?.toLowerCase()
  const curMode = isMode(normalizedMode) ? normalizedMode : undefined
  const chainWarning = t('proxies.page.chain.warning')
  const activeMode = curMode ?? 'rule'

  const onChangeMode = useLockFn(async (mode: Mode) => {
    // 断开连接
    if (mode !== curMode && verge?.auto_close_connection) {
      closeAllConnections()
    }
    try {
      // patchClashMode 在后端 PATCH 失败时会 reject，需提示用户而非静默失败
      await patchClashMode(mode)
      refreshClashConfig()
    } catch (error) {
      showNotice.error(error)
    }
  })

  const onToggleChainMode = useLockFn(async () => {
    const newChainMode = !isChainMode

    setIsChainMode(newChainMode)
    // 保存链式代理按钮状态到 localStorage
    localStorage.setItem('proxy-chain-mode-enabled', newChainMode.toString())

    if (!newChainMode) {
      // 退出链式代理模式时，清除链式代理配置
      try {
        debugLog('Exiting chain mode, clearing chain configuration')
        await updateProxyChainConfigInRuntime(null)
        debugLog('Chain configuration cleared successfully')
      } catch (error) {
        console.error('Failed to clear chain configuration:', error)
      }
    }
  })

  // 当开启链式代理模式时，获取配置数据
  useEffect(() => {
    if (!isChainMode) {
      updateChainConfigData(null)
      return
    }

    let cancelled = false

    const fetchChainConfig = async () => {
      try {
        const exitNode = localStorage.getItem('proxy-chain-exit-node')

        if (!exitNode) {
          console.error('No proxy chain exit node found in localStorage')
          if (!cancelled) {
            updateChainConfigData('')
          }
          return
        }

        const configData = await getRuntimeProxyChainConfig(exitNode)
        if (!cancelled) {
          updateChainConfigData(configData || '')
        }
      } catch (error) {
        console.error('Failed to get runtime proxy chain config:', error)
        if (!cancelled) {
          updateChainConfigData('')
        }
      }
    }

    fetchChainConfig()

    return () => {
      cancelled = true
    }
  }, [isChainMode, updateChainConfigData])

  useEffect(() => {
    if (normalizedMode && !isMode(normalizedMode)) {
      onChangeMode('rule')
    }
  }, [normalizedMode, onChangeMode])

  return (
    <BasePage
      full
      contentStyle={{ height: '100%' }}
      title={
        <Box
          component="span"
          data-tauri-drag-region="true"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            fontSize: { xs: 28, sm: 34 },
            fontWeight: 720,
            lineHeight: 1.08,
            letterSpacing: '-0.045em',
          }}
        >
          {isChainMode
            ? t('proxies.page.title.chainMode')
            : t('proxies.page.title.default')}
          {isChainMode && (
            <TooltipIcon
              title={chainWarning}
              icon={WarningRounded}
              color="warning"
              sx={{ p: 0.25 }}
            />
          )}
        </Box>
      }
    >
      <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
        <Box
          sx={{
            flex: '0 0 auto',
            px: { xs: 2, sm: 3 },
            pt: 2,
            pb: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box
              role="group"
              aria-label={t('proxies.page.labels.outboundMode')}
              sx={{
                display: 'inline-flex',
                minWidth: 0,
                flex: '0 1 auto',
                gap: 0.5,
                borderRadius: 'var(--radius-pill)',
                bgcolor: 'var(--shell-panel-muted)',
                p: 0.5,
              }}
            >
              {MODES.map((mode) => {
                const selected = mode === activeMode
                const ModeIcon = MODE_ICONS[mode]
                return (
                  <Button
                    key={mode}
                    aria-pressed={selected}
                    variant={selected ? 'contained' : 'text'}
                    onClick={() => onChangeMode(mode)}
                    startIcon={<ModeIcon sx={{ fontSize: 18 }} />}
                    sx={{
                      minWidth: 0,
                      height: 36,
                      px: 1.75,
                      border: 0,
                      borderRadius: 'var(--radius-pill)',
                      whiteSpace: 'nowrap',
                      color: selected ? 'primary.contrastText' : 'text.primary',
                      '&:hover': {
                        border: 0,
                        bgcolor: selected
                          ? 'primary.main'
                          : 'var(--shell-nav-hover)',
                      },
                    }}
                  >
                    {t(`proxies.page.modes.${mode}`)}
                  </Button>
                )
              })}
            </Box>

            <Button
              size="small"
              variant={isChainMode ? 'contained' : 'text'}
              onClick={onToggleChainMode}
              sx={{
                height: 38,
                flex: '0 0 auto',
                borderRadius: 'var(--radius-control)',
                bgcolor: isChainMode
                  ? 'primary.main'
                  : 'var(--shell-panel-muted)',
                '&:hover': {
                  bgcolor: isChainMode
                    ? 'primary.main'
                    : 'var(--shell-nav-hover)',
                },
              }}
              startIcon={
                isChainMode ? (
                  <LanRounded fontSize="small" />
                ) : (
                  <LanOutlined fontSize="small" />
                )
              }
            >
              {t('proxies.page.actions.toggleChain')}
            </Button>
          </Box>

          <Typography
            color="text.secondary"
            sx={{ mt: 1.25, fontSize: 13, lineHeight: 1.4 }}
          >
            {t(`proxies.page.modeDescriptions.${activeMode}`)}
          </Typography>
        </Box>

        <Box sx={{ minHeight: 0, flex: 1 }}>
          {isChainMode ? (
            <Box
              sx={{
                height: '100%',
                mx: { xs: 1, sm: 2 },
                mt: 1,
                overflow: 'hidden',
                border: '1px solid var(--shell-border)',
                borderRadius: 'var(--radius-control)',
                bgcolor: 'var(--shell-panel-muted)',
              }}
            >
              <ProxyGroups
                mode={activeMode}
                isChainMode
                chainConfigData={chainConfigData}
              />
            </Box>
          ) : (
            <PolicyDashboard />
          )}
        </Box>
      </Box>
    </BasePage>
  )
}

export default ProxyPage
