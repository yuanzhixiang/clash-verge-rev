import { useLockFn } from 'ahooks'
import {
  EthernetPort,
  Globe,
  type LucideIcon,
  Network,
  Split,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import { BasePage, TooltipIcon } from '@/components/base'
import { PolicyDashboard } from '@/components/proxy/policy-dashboard'
import { ProxyGroups } from '@/components/proxy/proxy-groups'
import { Button } from '@/components/ui/button'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
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
const MODE_ICONS: Record<Mode, LucideIcon> = {
  direct: EthernetPort,
  global: Globe,
  rule: Split,
}
const isMode = (value: unknown): value is Mode =>
  typeof value === 'string' && MODE_SET.has(value)

const ProxyPage = () => {
  const { t } = useTranslation()
  const pageScrollRef = useRef<HTMLDivElement>(null)

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
        <span
          data-tauri-drag-region="true"
          className="inline-flex items-center gap-compact text-[28px] font-[720] leading-[1.08] tracking-[-0.045em] sm:text-[34px]"
        >
          {isChainMode
            ? t('proxies.page.title.chainMode')
            : t('proxies.page.title.default')}
          {isChainMode && (
            <TooltipIcon
              title={chainWarning}
              icon={TriangleAlert}
              className="text-[var(--color-warning)]"
            />
          )}
        </span>
      }
    >
      <div
        ref={pageScrollRef}
        className="h-full overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="px-inset pt-inset pb-component sm:px-block">
          <div className="flex flex-wrap items-center gap-stack">
            <div
              role="group"
              aria-label={t('proxies.page.labels.outboundMode')}
              className="inline-flex min-w-0 flex-[0_1_auto] gap-inline rounded-[var(--radius-pill)] bg-[var(--color-bg-subtle)] p-inline"
            >
              {MODES.map((mode) => {
                const selected = mode === activeMode
                const ModeIcon = MODE_ICONS[mode]
                return (
                  <Button
                    key={mode}
                    aria-pressed={selected}
                    variant={selected ? 'default' : 'ghost'}
                    onClick={() => onChangeMode(mode)}
                    className={cn(
                      'h-9 min-w-0 rounded-[var(--radius-pill)] px-3.5 whitespace-nowrap',
                      selected
                        ? 'hover:bg-primary'
                        : 'text-[var(--color-text-primary)]',
                    )}
                  >
                    <ModeIcon className="size-[18px]" />
                    {t(`proxies.page.modes.${mode}`)}
                  </Button>
                )
              })}
            </div>

            <Button
              variant={isChainMode ? 'default' : 'ghost'}
              onClick={onToggleChainMode}
              className={cn(
                'h-[38px] flex-[0_0_auto] rounded-[var(--radius-control)]',
                isChainMode
                  ? 'hover:bg-primary'
                  : 'bg-[var(--color-bg-subtle)] text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              <Network className="size-[18px]" />
              {t('proxies.page.actions.toggleChain')}
            </Button>
          </div>

          <p className="mt-2.5 text-label text-[var(--color-text-secondary)]">
            {t(`proxies.page.modeDescriptions.${activeMode}`)}
          </p>
        </div>

        <div>
          {isChainMode ? (
            <div className="mx-component mt-component rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] sm:mx-inset">
              <ProxyGroups
                mode={activeMode}
                isChainMode
                chainConfigData={chainConfigData}
                scrollElementRef={pageScrollRef}
              />
            </div>
          ) : (
            <PolicyDashboard />
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default ProxyPage
