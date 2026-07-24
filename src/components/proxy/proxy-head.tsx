import {
  ArrowDownAZ,
  ArrowUpDown,
  Clock,
  Eye,
  EyeOff,
  Filter,
  FilterX,
  Gauge,
  LocateFixed,
  Radio,
  WifiOff,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseSearchBox } from '@/components/base'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import delayManager from '@/services/delay'
import { debugLog } from '@/utils/debug'

import type { ProxySortType } from './use-filter-sort'
import type { HeadState } from './use-head-state'

interface Props {
  className?: string
  url?: string
  groupName: string
  headState: HeadState
  onLocation: () => void
  onCheckDelay: () => void
  onHeadState: (val: Partial<HeadState>) => void
}

export const ProxyHead = ({
  className,
  url,
  groupName,
  headState,
  onHeadState,
  onLocation,
  onCheckDelay,
}: Props) => {
  const {
    showType,
    sortType,
    filterText,
    textState,
    testUrl,
    filterMatchCase,
    filterMatchWholeWord,
    filterUseRegularExpression,
  } = headState

  const { t } = useTranslation()
  const [autoFocus, setAutoFocus] = useState(false)

  useEffect(() => {
    // fix the focus conflict
    const timer = setTimeout(() => setAutoFocus(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const { verge } = useVerge()
  const defaultLatencyUrl =
    verge?.default_latency_test?.trim() ||
    'http://cp.cloudflare.com/generate_204'

  useEffect(() => {
    delayManager.setUrl(groupName, testUrl?.trim() || url || defaultLatencyUrl)
  }, [groupName, testUrl, defaultLatencyUrl, url])

  return (
    <div className={cn('flex items-center gap-inline', className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.locate')}
        onClick={onLocation}
      >
        <LocateFixed className="size-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.delayCheck')}
        onClick={() => {
          debugLog(`[ProxyHead] 点击延迟测试按钮，组: ${groupName}`)
          // Remind the user that it is custom test url
          if (testUrl?.trim() && textState !== 'filter') {
            debugLog(`[ProxyHead] 使用自定义测试URL: ${testUrl}`)
            onHeadState({ textState: 'url' })
          }
          onCheckDelay()
        }}
      >
        <Gauge className="size-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={
          [
            t('proxies.page.tooltips.sortDefault'),
            t('proxies.page.tooltips.sortDelay'),
            t('proxies.page.tooltips.sortName'),
          ][sortType]
        }
        onClick={() =>
          onHeadState({ sortType: ((sortType + 1) % 3) as ProxySortType })
        }
      >
        {sortType !== 1 && sortType !== 2 && <ArrowUpDown className="size-5" />}
        {sortType === 1 && <Clock className="size-5" />}
        {sortType === 2 && <ArrowDownAZ className="size-5" />}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.delayCheckUrl')}
        onClick={() =>
          onHeadState({ textState: textState === 'url' ? null : 'url' })
        }
      >
        {textState === 'url' ? (
          <Radio className="size-5" />
        ) : (
          <WifiOff className="size-5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={
          showType
            ? t('proxies.page.tooltips.showBasic')
            : t('proxies.page.tooltips.showDetail')
        }
        onClick={() => onHeadState({ showType: !showType })}
      >
        {showType ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.filter')}
        onClick={() =>
          onHeadState({ textState: textState === 'filter' ? null : 'filter' })
        }
      >
        {textState === 'filter' ? (
          <Filter className="size-5" />
        ) : (
          <FilterX className="size-5" />
        )}
      </Button>

      {textState === 'filter' && (
        <div className="ml-inline flex-auto">
          <BaseSearchBox
            autoFocus={autoFocus}
            value={filterText}
            searchState={{
              matchCase: filterMatchCase,
              matchWholeWord: filterMatchWholeWord,
              useRegularExpression: filterUseRegularExpression,
            }}
            onSearch={(_, state) =>
              onHeadState({
                filterText: state.text,
                filterMatchCase: state.matchCase,
                filterMatchWholeWord: state.matchWholeWord,
                filterUseRegularExpression: state.useRegularExpression,
              })
            }
          />
        </div>
      )}

      {textState === 'url' && (
        <Input
          autoComplete="new-password"
          autoFocus={autoFocus}
          autoSave="off"
          value={testUrl}
          placeholder={t('proxies.page.placeholders.delayCheckUrl')}
          onChange={(e) => onHeadState({ testUrl: e.target.value })}
          className="ml-inline h-8 flex-auto"
        />
      )}
    </div>
  )
}
