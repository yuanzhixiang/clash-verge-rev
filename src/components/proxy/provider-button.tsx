import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { Database, Loader2, RefreshCw, X } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { updateProxyProviderEx } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import parseTraffic from '@/utils/parse-traffic'

const TypeTag = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-5 items-center rounded-[var(--radius-compact)] bg-[color-mix(in_srgb,var(--color-text-primary)_5.5%,transparent)] px-compact text-[11px] font-medium leading-none text-[var(--color-text-secondary)]">
    {children}
  </span>
)

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

      await updateProxyProviderEx(name)

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
          await updateProxyProviderEx(name)
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
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="proxy-provider-trigger h-9 shrink-0 gap-component rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-stack text-[13.5px] font-[550] whitespace-nowrap text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-active)] [&_svg]:text-[var(--color-text-secondary)]"
      >
        <Database className="size-5" />
        {t('proxies.page.provider.title')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="flex max-h-[calc(100%-24px)] w-[min(680px,calc(100vw-24px))] flex-col gap-0 overflow-hidden rounded-[var(--radius-overlay)] border-[var(--color-border-strong)] bg-[var(--color-bg-page)] p-0 shadow-[var(--shadow-shell)] sm:max-w-none"
        >
          <div className="flex items-center justify-between gap-inset px-block pt-[22px] pb-inset max-[520px]:items-start">
            <DialogTitle className="min-w-0 text-[20px] font-[650] leading-[1.25] tracking-[-0.025em]">
              {t('proxies.page.provider.title')}
            </DialogTitle>
            <div className="flex flex-none items-center gap-inline">
              <Button
                variant="default"
                size="sm"
                disabled={isUpdatingAny}
                onClick={updateAllProviders}
                aria-label={t('proxies.page.provider.actions.updateAll')}
                className="rounded-[var(--radius-compact)] px-2.5 max-[420px]:min-w-8 max-[420px]:px-1.5"
              >
                {isUpdatingAny && <Loader2 className="animate-spin" />}
                {t('proxies.page.provider.actions.updateAll')}
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

          <div className="min-h-0 overflow-y-auto px-block pt-0 pb-block">
            <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--color-border)]">
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
                    <div
                      key={key}
                      className={cn(
                        'grid grid-cols-[minmax(0,1fr)_44px] border-b border-[var(--color-border)] last:border-b-0',
                        hasSubInfo ? 'min-h-[92px]' : 'min-h-[64px]',
                      )}
                    >
                      <div className="grid min-h-[inherit] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-stack px-inset py-2.5 text-left transition-[background-color] duration-[160ms] ease-out hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4.5%,transparent)] max-[520px]:grid-cols-[minmax(0,1fr)] max-[520px]:gap-y-compact max-[520px]:px-stack">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-inline">
                            <p
                              title={key}
                              className="mb-[6px] min-w-0 basis-full truncate text-[14px] font-semibold leading-[1.25] tracking-[-0.01em]"
                            >
                              {key}
                            </p>
                            <TypeTag>{provider.proxies.length}</TypeTag>
                            <TypeTag>{provider.vehicleType}</TypeTag>
                          </div>

                          {hasSubInfo && (
                            <div className="mt-2.5">
                              <div className="mb-[6px] flex justify-between gap-inset text-[11.5px] text-[var(--color-text-secondary)]">
                                <span
                                  title={t('shared.labels.usedTotal') as string}
                                >
                                  {parseTraffic(upload + download)} /{' '}
                                  {parseTraffic(total)}
                                </span>
                                <span
                                  title={
                                    t('shared.labels.expireTime') as string
                                  }
                                >
                                  {parseExpire(expire)}
                                </span>
                              </div>
                              <Progress
                                value={progress}
                                style={{ opacity: total > 0 ? 1 : 0 }}
                                className="h-1 bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]"
                              />
                            </div>
                          )}
                        </div>

                        <p
                          title={`${t('shared.labels.updateAt')}: ${time.fromNow()}`}
                          className="truncate text-[12px] leading-[1.4] text-[var(--color-text-secondary)]"
                        >
                          {t('shared.labels.updateAt')}: {time.fromNow()}
                        </p>
                      </div>
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => updateProvider(key)}
                          disabled={isUpdating}
                          title={t('proxies.page.provider.actions.update')}
                          aria-label={t('proxies.page.provider.actions.update')}
                          className="text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent)]"
                        >
                          <RefreshCw
                            className={cn(isUpdating && 'animate-spin')}
                          />
                        </Button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
