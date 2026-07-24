import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { Database, Loader2, RefreshCw, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateRuleProvider } from 'tauri-plugin-mihomo-api'

import { RuleProviderDetailDialog } from '@/components/rule/rule-provider-detail-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'
import type { RuleProviderContent } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

const metaTagClass =
  'inline-flex h-5 items-center rounded-[var(--radius-compact)] px-compact text-[11px] font-medium leading-none text-[var(--color-text-secondary)] bg-[color-mix(in_srgb,var(--color-text-primary)_5.5%,transparent)]'

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
        variant="ghost"
        onClick={() => setOpen(true)}
        className="rule-provider-trigger h-[38px] min-w-0 shrink-0 rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-3 text-[13.5px] font-[550] leading-none whitespace-nowrap text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] active:bg-[var(--color-bg-active)]"
      >
        <Database className="size-5 text-[var(--color-text-secondary)]" />
        {t('rules.page.provider.trigger')}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden p-0 sm:max-w-none"
          style={{ width: 'min(680px, calc(100vw - 24px))' }}
        >
          <DialogHeader className="space-y-0 px-6 pt-[22px] pb-4">
            <div className="flex items-center justify-between gap-inset max-[520px]:items-start">
              <DialogTitle className="min-w-0 text-[20px] font-[650] leading-[1.25] tracking-[-0.025em]">
                {t('rules.page.provider.dialogTitle')}
              </DialogTitle>

              <div className="flex shrink-0 items-center gap-inline">
                <Button
                  size="sm"
                  disabled={isUpdatingAny}
                  onClick={updateAllProviders}
                  className="min-h-8 rounded-[var(--radius-compact)]"
                >
                  {isUpdatingAny && <Loader2 className="animate-spin" />}
                  {t('rules.page.provider.actions.updateAll')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleClose}
                  aria-label={t('shared.actions.close')}
                  title={t('shared.actions.close')}
                  className="text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                >
                  <X />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 pb-6">
            <ul className="max-h-[60vh] min-h-[120px] overflow-y-auto overflow-x-hidden rounded-[var(--radius-container)] border border-[var(--color-border)]">
              {Object.entries(ruleProviders || {})
                .sort()
                .map(([key, item]) => {
                  const provider = item
                  const time = dayjs(provider.updatedAt)
                  const isUpdating = updating[key]

                  return (
                    <li
                      key={key}
                      className="grid min-h-16 grid-cols-[minmax(0,1fr)_44px] border-b border-[var(--color-border)] last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedProvider(key)}
                        aria-label={t('rules.page.provider.detail.open', {
                          name: key,
                        })}
                        className={cn(
                          'grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-stack px-inset py-[10px] text-left outline-none transition-colors',
                          'hover:bg-[var(--color-bg-hover)]',
                          'focus-visible:-outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]',
                          'max-[520px]:grid-cols-[minmax(0,1fr)] max-[520px]:gap-y-compact max-[520px]:px-stack',
                        )}
                      >
                        <div className="min-w-0">
                          <div
                            title={key}
                            className="mb-compact truncate text-[14px] font-semibold leading-[1.25] tracking-[-0.01em]"
                          >
                            {key}
                          </div>
                          <div className="flex flex-wrap gap-inline">
                            <span className={metaTagClass}>
                              {provider.ruleCount}
                            </span>
                            <span className={metaTagClass}>
                              {provider.vehicleType}
                            </span>
                            <span className={metaTagClass}>
                              {provider.behavior}
                            </span>
                          </div>
                        </div>

                        <div
                          title={`${t('shared.labels.updateAt')}: ${time.fromNow()}`}
                          className="truncate text-[12px] leading-[1.4] text-[var(--color-text-secondary)]"
                        >
                          {t('shared.labels.updateAt')}: {time.fromNow()}
                        </div>
                      </button>

                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => updateProvider(key)}
                          disabled={isUpdating}
                          aria-label={t('rules.page.provider.actions.update')}
                          title={t('rules.page.provider.actions.update')}
                          className="text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent)]"
                        >
                          <RefreshCw
                            className={isUpdating ? 'animate-spin' : undefined}
                          />
                        </Button>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </div>
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
