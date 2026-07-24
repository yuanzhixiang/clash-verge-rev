import { useLockFn } from 'ahooks'
import { Columns3, Rows3, Table, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  BaseStyledSelect,
  type SearchState,
  VirtualList,
} from '@/components/base'
import {
  ConnectionDetail,
  ConnectionDetailRef,
} from '@/components/connection/connection-detail'
import { ConnectionRowItem } from '@/components/connection/connection-row-item'
import {
  getConnectionStartTime,
  useConnectionRowViews,
} from '@/components/connection/connection-row-view'
import { ConnectionTable } from '@/components/connection/connection-table'
import { Button } from '@/components/ui/button'
import { SelectItem } from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConnectionData } from '@/hooks/use-connection-data'
import { useConnectionSetting } from '@/hooks/use-connection-setting'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVisibility } from '@/hooks/use-visibility'
import { cn } from '@/lib/utils'
import parseTraffic from '@/utils/parse-traffic'

type OrderFunc = (list: IConnectionsItem[]) => IConnectionsItem[]

const ORDER_OPTIONS = [
  {
    id: 'default',
    labelKey: 'connections.components.order.default',
    fn: (list: IConnectionsItem[]) =>
      list.sort(
        (a, b) => getConnectionStartTime(b) - getConnectionStartTime(a),
      ),
  },
  {
    id: 'uploadSpeed',
    labelKey: 'connections.components.order.uploadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curUpload ?? 0) - (a.curUpload ?? 0)),
  },
  {
    id: 'downloadSpeed',
    labelKey: 'connections.components.order.downloadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curDownload ?? 0) - (a.curDownload ?? 0)),
  },
] as const

type OrderKey = (typeof ORDER_OPTIONS)[number]['id']

const orderFunctionMap = ORDER_OPTIONS.reduce<Record<OrderKey, OrderFunc>>(
  (acc, option) => {
    acc[option.id] = option.fn
    return acc
  },
  {} as Record<OrderKey, OrderFunc>,
)

const EMPTY_CONNECTIONS: IConnectionsItem[] = []
const ConnectionsPage = () => {
  const { t } = useTranslation()
  const pageVisible = useVisibility()
  const [match, setMatch] = useState<(input: string) => boolean>(
    () => () => true,
  )
  const [hasSearch, setHasSearch] = useState(false)
  const [curOrderOpt, setCurOrderOpt] = useState<OrderKey>('default')
  const [connectionsType, setConnectionsType] = useState<'active' | 'closed'>(
    'active',
  )

  const {
    response: { data: connections },
    clearClosedConnections,
  } = useConnectionData({ enabled: pageVisible })
  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: pageVisible })

  const [setting, setSetting] = useConnectionSetting()

  const isTableLayout = setting.layout === 'table'

  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false)

  const selectedConnections =
    connectionsType === 'active'
      ? (connections?.activeConnections ?? EMPTY_CONNECTIONS)
      : (connections?.closedConnections ?? EMPTY_CONNECTIONS)

  const filterConn = useMemo(() => {
    const orderFunc = orderFunctionMap[curOrderOpt]

    if (isTableLayout && !hasSearch) return selectedConnections
    if (!hasSearch) return orderFunc([...selectedConnections])

    const matchConns = selectedConnections.filter((conn) => {
      const { host, destinationIP, remoteDestination, process, processPath } =
        conn.metadata
      return [
        host,
        destinationIP,
        remoteDestination,
        process,
        processPath,
        conn.rule,
        conn.rulePayload,
        conn.chains.join(' '),
      ].some((value) => match(value || ''))
    })

    return orderFunc ? orderFunc(matchConns) : matchConns
  }, [selectedConnections, isTableLayout, hasSearch, match, curOrderOpt])

  const displayRows = useConnectionRowViews(
    isTableLayout ? EMPTY_CONNECTIONS : filterConn,
  )

  const detailRef = useRef<ConnectionDetailRef>(null!)
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null)

  const selectConnectionsType = useCallback(
    (type: 'active' | 'closed') => {
      if (type === connectionsType) return
      detailRef.current?.close()
      setSelectedConnectionId(null)
      setIsColumnManagerOpen(false)
      setConnectionsType(type)
    },
    [connectionsType],
  )

  const showDetailById = useCallback(
    (id: string) => {
      const connection = filterConn.find((item) => item.id === id)
      if (connection) {
        setSelectedConnectionId(id)
        detailRef.current?.open(connection, connectionsType === 'closed')
      }
    },
    [connectionsType, filterConn],
  )

  const onCloseAll = useLockFn(closeAllConnections)

  const handleSearch = useCallback(
    (match: (content: string) => boolean, state: SearchState) => {
      setMatch(() => match)
      setHasSearch(state.text.length > 0)
    },
    [],
  )
  const hasTableData = filterConn.length > 0

  return (
    <BasePage
      full
      title={
        <span className="whitespace-nowrap">{t('connections.page.title')}</span>
      }
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 'var(--radius-control)',
        minHeight: 0,
        position: 'relative',
      }}
      header={
        <div className="flex items-center gap-inset">
          <div className="mx-component">
            {t('shared.labels.downloaded')}:{' '}
            {parseTraffic(traffic?.downTotal || 0)}
          </div>
          <div className="mx-component">
            {t('shared.labels.uploaded')}: {parseTraffic(traffic?.upTotal || 0)}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-current"
            aria-label={
              isTableLayout
                ? t('shared.actions.listView')
                : t('shared.actions.tableView')
            }
            onClick={() =>
              setSetting((o) =>
                o?.layout !== 'table'
                  ? { ...o, layout: 'table' }
                  : { ...o, layout: 'list' },
              )
            }
          >
            {isTableLayout ? <Rows3 /> : <Table />}
          </Button>
          <Button size="sm" onClick={onCloseAll}>
            <span className="whitespace-nowrap">
              {t('shared.actions.closeAll')}
            </span>
          </Button>
        </div>
      }
    >
      <div className="sticky top-0 z-[2] mx-stack mb-inline flex min-h-9 select-text items-center gap-component pt-component">
        <div className="mr-component flex shrink-0">
          <Button
            size="sm"
            variant={connectionsType === 'active' ? 'default' : 'outline'}
            className="rounded-r-none"
            onClick={() => selectConnectionsType('active')}
          >
            {t('connections.components.actions.active')}{' '}
            {connections?.activeConnections.length}
          </Button>
          <Button
            size="sm"
            variant={connectionsType === 'closed' ? 'default' : 'outline'}
            className="-ml-px rounded-l-none"
            onClick={() => selectConnectionsType('closed')}
          >
            {t('connections.components.actions.closed')}{' '}
            {connections?.closedConnections.length}
          </Button>
        </div>
        {!isTableLayout && (
          <BaseStyledSelect
            value={curOrderOpt}
            onValueChange={(v) => setCurOrderOpt(v as OrderKey)}
          >
            {ORDER_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </BaseStyledSelect>
        )}
        <div className="flex flex-1 items-center [&>*]:flex-1">
          <BaseSearchBox onSearch={handleSearch} />
        </div>
        {isTableLayout && hasTableData && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="flex-none"
                aria-label={t('connections.components.columnManager.title')}
                onClick={() => setIsColumnManagerOpen(true)}
              >
                <Columns3 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('connections.components.columnManager.title')}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {!hasTableData ? (
        <BaseEmpty />
      ) : isTableLayout ? (
        <ConnectionTable
          connections={filterConn}
          onShowDetail={showDetailById}
          selectedId={selectedConnectionId}
          columnManagerOpen={isColumnManagerOpen}
          onCloseColumnManager={() => setIsColumnManagerOpen(false)}
        />
      ) : (
        <VirtualList
          key={connectionsType}
          count={displayRows.length}
          estimateSize={56}
          renderItem={(i) => (
            <ConnectionRowItem
              row={displayRows[i]}
              closed={connectionsType === 'closed'}
              selected={displayRows[i].id === selectedConnectionId}
              onShowDetail={showDetailById}
            />
          )}
          style={{
            flex: 1,
            borderRadius: 'var(--radius-control)',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        />
      )}
      <ConnectionDetail
        ref={detailRef}
        onClose={() => setSelectedConnectionId(null)}
      />
      {connectionsType === 'closed' && filterConn.length > 0 && (
        <Button
          onClick={() => clearClosedConnections()}
          className={cn(
            'absolute right-inset z-10 animate-in gap-inline rounded-[var(--radius-pill)] shadow-[var(--shadow-card)] fade-in zoom-in-95',
            isTableLayout
              ? 'bottom-[calc(var(--spacing-page)+var(--spacing-compact))]'
              : 'bottom-inset',
          )}
        >
          <Trash2 className="size-4" />
          {t('shared.actions.clear')}
        </Button>
      )}
    </BasePage>
  )
}

export default ConnectionsPage
