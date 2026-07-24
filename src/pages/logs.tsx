import { ArrowUpDown, CirclePause, CirclePlay } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  BaseStyledSelect,
  type SearchState,
  VirtualList,
  type VirtualListHandle,
} from '@/components/base'
import LogItem from '@/components/log/log-item'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import { useClashLog } from '@/hooks/use-clash-log'
import { useLogData } from '@/hooks/use-log-data'
import { cn } from '@/lib/utils'

const LogPage = () => {
  const { t } = useTranslation()
  const [clashLog, setClashLog] = useClashLog()
  const enableLog = clashLog.enable
  const logState = clashLog.logFilter
  const logOrder = clashLog.logOrder ?? 'asc'
  const isDescending = logOrder === 'desc'

  const [match, setMatch] = useState(() => (_: string) => true)
  const [searchState, setSearchState] = useState<SearchState>()
  const {
    response: { data: logData },
    refreshGetClashLog,
  } = useLogData()

  const filterLogs = useMemo(() => {
    if (!logData || logData.length === 0) {
      return []
    }

    // Server-side filtering handles level filtering via query parameters
    // We only need to apply search filtering here
    return logData.filter((data) => {
      // 构建完整的搜索文本，包含时间、类型和内容
      const searchText =
        `${data.time || ''} ${data.type} ${data.payload}`.toLowerCase()

      const matchesSearch = match(searchText)

      return (
        (logState == 'all' ? true : data.type.includes(logState)) &&
        matchesSearch
      )
    })
  }, [logData, logState, match])

  const filteredLogs = useMemo(
    () => (isDescending ? [...filterLogs].reverse() : filterLogs),
    [filterLogs, isDescending],
  )

  const scrollRef = useRef({ isNearBottom: true })
  const virtuosoRef = useRef<VirtualListHandle>(null)

  useEffect(() => {
    if (!isDescending && scrollRef.current.isNearBottom) {
      virtuosoRef.current?.scrollToIndex(filteredLogs.length - 1, {
        behavior: 'smooth',
      })
    }
  }, [isDescending, filteredLogs.length])

  const handleLogLevelChange = (newLevel: LogFilter) => {
    setClashLog((pre) => ({ ...pre!, logFilter: newLevel }))
  }

  const handleToggleLog = async () => {
    setClashLog((pre) => ({ ...pre!, enable: !enableLog }))
  }

  const handleToggleOrder = () => {
    setClashLog((pre) => ({
      ...pre!,
      logOrder: pre!.logOrder === 'desc' ? 'asc' : 'desc',
    }))
  }

  return (
    <BasePage
      full
      title={t('logs.page.title')}
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
      header={
        <div className="flex items-center gap-inset">
          <Button
            variant="ghost"
            size="icon-sm"
            title={t(
              enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
            )}
            aria-label={t(
              enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
            )}
            onClick={handleToggleLog}
          >
            {enableLog ? (
              <CirclePause className="size-6" />
            ) : (
              <CirclePlay className="size-6" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t(
              isDescending
                ? 'logs.actions.showAscending'
                : 'logs.actions.showDescending',
            )}
            aria-label={t(
              isDescending
                ? 'logs.actions.showAscending'
                : 'logs.actions.showDescending',
            )}
            onClick={handleToggleOrder}
          >
            <ArrowUpDown
              className={cn(
                'size-6 transition-transform duration-[var(--duration-base)]',
                isDescending && '-scale-y-100',
              )}
            />
          </Button>

          <Button
            size="sm"
            onClick={() => {
              refreshGetClashLog(true)
            }}
          >
            {t('shared.actions.clear')}
          </Button>
        </div>
      }
    >
      <div className="mx-[10px] mb-inline flex h-[39px] items-center pt-component">
        <BaseStyledSelect
          value={logState}
          onValueChange={(value) => handleLogLevelChange(value as LogFilter)}
        >
          <SelectItem value="all">
            {t('shared.filters.logLevels.all')}
          </SelectItem>
          <SelectItem value="debug">
            {t('shared.filters.logLevels.debug')}
          </SelectItem>
          <SelectItem value="info">
            {t('shared.filters.logLevels.info')}
          </SelectItem>
          <SelectItem value="warn">
            {t('shared.filters.logLevels.warn')}
          </SelectItem>
          <SelectItem value="err">
            {t('shared.filters.logLevels.error')}
          </SelectItem>
        </BaseStyledSelect>
        <BaseSearchBox
          onSearch={(matcher, state) => {
            setMatch(() => matcher)
            setSearchState(state)
          }}
        />
      </div>

      {filteredLogs.length > 0 ? (
        <VirtualList
          ref={virtuosoRef}
          count={filteredLogs.length}
          estimateSize={50}
          renderItem={(i) => (
            <LogItem value={filteredLogs[i]} searchState={searchState} />
          )}
          onScroll={(event) => {
            const element = event.currentTarget as HTMLDivElement
            scrollRef.current.isNearBottom =
              element.scrollHeight - element.scrollTop - element.clientHeight <=
              20
          }}
          style={{ flex: 1 }}
        />
      ) : (
        <BaseEmpty />
      )}
    </BasePage>
  )
}

export default LogPage
