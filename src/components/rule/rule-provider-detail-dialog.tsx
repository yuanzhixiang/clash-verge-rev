import { ArrowLeft, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RuleProvider } from 'tauri-plugin-mihomo-api'

import {
  BaseEmpty,
  BaseLoading,
  BaseSearchBox,
  VirtualList,
} from '@/components/base'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  getRuleProviderContent,
  type RuleProviderContent,
} from '@/services/cmds'

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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none"
        style={{
          width: 'min(820px, calc(100vw - 24px))',
          height: 'min(720px, calc(100vh - 24px))',
        }}
      >
        <DialogHeader className="space-y-0 px-3 pt-5 pb-3.5 sm:px-6">
          <div className="flex items-center gap-component">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={t('rules.page.provider.detail.back')}
              title={t('rules.page.provider.detail.back')}
              className="text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <DialogTitle
                title={providerName || undefined}
                className="truncate text-[20px] font-[650] leading-[1.25] tracking-[-0.025em]"
              >
                {providerName}
              </DialogTitle>
              <p className="mt-0.5 text-[11.5px] leading-[1.4] text-[var(--color-text-secondary)]">
                {[provider?.format, provider?.behavior, provider?.ruleCount]
                  .filter((value) => value != null)
                  .join(' · ')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={t('shared.actions.close')}
              title={t('shared.actions.close')}
              className="text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            >
              <X />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-col px-3 pb-6 sm:px-6">
          {content?.status === 'ready' && (
            <div className="mb-stack shrink-0">
              <BaseSearchBox
                placeholder={t('rules.page.provider.detail.searchPlaceholder')}
                startAdornment={<Search aria-hidden className="size-[18px]" />}
                onSearch={(nextMatch) => setMatch(() => nextMatch)}
              />
            </div>
          )}

          <div className="flex min-h-0 flex-1 overflow-hidden rounded-[var(--radius-container)] border border-[var(--color-border)]">
            {loading && (
              <div className="m-auto">
                <BaseLoading />
              </div>
            )}

            {!loading && error && (
              <BaseEmpty
                text={t('rules.page.provider.detail.loadFailed')}
                extra={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void load(true)}
                    className="mt-component"
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
                      <div
                        className={cn(
                          'grid min-h-[34px] grid-cols-[54px_minmax(0,1fr)] items-center',
                          index % 2 === 0
                            ? 'bg-transparent'
                            : 'bg-[color-mix(in_srgb,var(--color-text-primary)_2.5%,transparent)]',
                          'hover:bg-[color-mix(in_srgb,var(--color-text-primary)_5.5%,transparent)]',
                        )}
                      >
                        <span className="px-stack text-right text-[11px] text-[var(--color-text-secondary)]">
                          {(item?.index ?? index) + 1}
                        </span>
                        <code
                          title={item?.rule}
                          className="min-w-0 truncate pr-stack font-mono text-[12px] leading-[1.5]"
                        >
                          {item?.rule}
                        </code>
                      </div>
                    )
                  }}
                />
              )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
