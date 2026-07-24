import { useDebounceFn } from 'ahooks'
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
import { memo, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import delayManager from '@/services/delay'

import { BaseSearchBox, type SearchState } from '../base'

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

export const ProxyGroupTools = memo(function ProxyGroupTools(props: Props) {
  const {
    className,
    url,
    groupName,
    headState,
    onCheckDelay,
    onHeadState,
    onLocation,
  } = props

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

  const { verge } = useVerge()
  const defaultLatencyUrl =
    verge?.default_latency_test?.trim() ||
    'http://cp.cloudflare.com/generate_204'

  useEffect(() => {
    delayManager.setUrl(groupName, testUrl?.trim() || url || defaultLatencyUrl)
  }, [groupName, testUrl, defaultLatencyUrl, url])

  // 过滤输入是高频操作，且每次都会触发整组代理的重新过滤/排序与虚拟列表重渲染，
  // 因此对写入 headState 的动作做防抖，避免每输入一个字符就过滤一次。
  const { run: applyFilter, flush: flushFilter } = useDebounceFn(
    (state: SearchState) => {
      onHeadState({
        filterText: state.text,
        filterMatchCase: state.matchCase,
        filterMatchWholeWord: state.matchWholeWord,
        filterUseRegularExpression: state.useRegularExpression,
      })
    },
    { wait: 600 },
  )

  // 关闭过滤框或卸载时立即应用最后一次输入，避免丢失未生效的过滤条件。
  useEffect(() => {
    if (textState !== 'filter') flushFilter()
  }, [textState, flushFilter])
  useEffect(() => () => flushFilter(), [flushFilter])

  return (
    <div
      className={cn(
        'ml-inset flex h-9 flex-1 items-center justify-end gap-inline',
        className,
      )}
    >
      {textState === 'filter' && (
        <div className="flex-auto">
          <BaseSearchBox
            defaultValue={filterText}
            matchCase={filterMatchCase}
            matchWholeWord={filterMatchWholeWord}
            useRegularExpression={filterUseRegularExpression}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onSearch={(_, state) => applyFilter(state)}
          />
        </div>
      )}

      {textState === 'url' && (
        <Input
          autoComplete="new-password"
          autoSave="off"
          value={testUrl}
          placeholder={t('proxies.page.placeholders.delayCheckUrl')}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onChange={(e) => onHeadState({ testUrl: e.target.value })}
          className="h-8 flex-auto"
        />
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.locate')}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!headState.open)
            // eslint-disable-next-line @eslint-react/dom-no-flush-sync
            flushSync(() => onHeadState({ open: true }))
          onLocation()
        }}
      >
        <LocateFixed className="size-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.delayCheck')}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!headState.open)
            // eslint-disable-next-line @eslint-react/dom-no-flush-sync
            flushSync(() => onHeadState({ open: true }))
          // Remind the user that it is custom test url
          if (testUrl?.trim() && textState !== 'filter') {
            onHeadState({ textState: 'url' })
          }
          onCheckDelay()
        }}
      >
        <Gauge className="size-4" />
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
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!headState.open)
            // eslint-disable-next-line @eslint-react/dom-no-flush-sync
            flushSync(() => onHeadState({ open: true }))
          onHeadState({
            sortType: ((sortType + 1) % 3) as ProxySortType,
          })
        }}
      >
        {sortType !== 1 && sortType !== 2 && <ArrowUpDown className="size-4" />}
        {sortType === 1 && <Clock className="size-4" />}
        {sortType === 2 && <ArrowDownAZ className="size-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.delayCheckUrl')}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onHeadState({
            textState: textState === 'url' ? null : 'url',
          })
        }}
      >
        {textState === 'url' ? (
          <Radio className="size-4" />
        ) : (
          <WifiOff className="size-4" />
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
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!headState.open)
            // eslint-disable-next-line @eslint-react/dom-no-flush-sync
            flushSync(() => onHeadState({ open: true }))
          onHeadState({ showType: !showType })
        }}
      >
        {showType ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-current"
        title={t('proxies.page.tooltips.filter')}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!headState.open && textState !== 'filter')
            // eslint-disable-next-line @eslint-react/dom-no-flush-sync
            flushSync(() => onHeadState({ open: true }))
          onHeadState({ textState: textState === 'filter' ? null : 'filter' })
        }}
      >
        {textState === 'filter' ? (
          <Filter className="size-4" />
        ) : (
          <FilterX className="size-4" />
        )}
      </Button>
    </div>
  )
})
