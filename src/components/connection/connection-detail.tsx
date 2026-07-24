import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { ChevronDown } from 'lucide-react'
import {
  Fragment,
  useCallback,
  useImperativeHandle,
  useState,
  type Ref,
} from 'react'
import { useTranslation } from 'react-i18next'
import { closeConnection } from 'tauri-plugin-mihomo-api'

import { Button } from '@/components/ui/button'
import parseTraffic from '@/utils/parse-traffic'

import { ConnectionRouteTimeline } from './connection-route'
import {
  formatConnectionChainPath,
  getConnectionChainPath,
} from './connection-route-utils'
import {
  getConnectionHost,
  getConnectionProcess,
  getConnectionRule,
  getConnectionSource,
  getConnectionTypeLabel,
} from './connection-row-view'

export interface ConnectionDetailRef {
  open: (detail: IConnectionsItem, closed: boolean) => void
  close: () => void
}

export function ConnectionDetail({
  ref,
  onClose: onClosed,
}: {
  ref?: Ref<ConnectionDetailRef>
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<IConnectionsItem | null>(null)
  const [closed, setClosed] = useState(false)

  const onClose = useCallback(() => {
    setOpen(false)
    setDetail(null)
    setClosed(false)
    onClosed?.()
  }, [onClosed])

  useImperativeHandle(ref, () => ({
    open: (detail: IConnectionsItem, closed: boolean) => {
      setOpen(true)
      setDetail(detail)
      setClosed(closed)
    },
    close: onClose,
  }))

  if (!open || !detail) return null

  return (
    <div className="absolute right-component bottom-component left-component z-[5] sm:right-stack sm:bottom-2.5 sm:left-stack">
      <InnerConnectionDetail data={detail} closed={closed} onClose={onClose} />
    </div>
  )
}

interface InnerProps {
  data: IConnectionsItem
  closed: boolean
  onClose?: () => void
}

const InnerConnectionDetail = ({ data, closed, onClose }: InnerProps) => {
  const { t } = useTranslation()
  const { metadata } = data
  const chains = formatConnectionChainPath(data.chains)
  const chainPath = getConnectionChainPath(data.chains)
  const rule = getConnectionRule(data)
  const host = getConnectionHost(data)
  const destination = metadata.destinationIP || metadata.remoteDestination
  const process = getConnectionProcess(data)
  const processDetail =
    metadata.process && metadata.processPath
      ? `${metadata.process} (${metadata.processPath})`
      : process
  const policy = chainPath.length > 1 ? chainPath.slice(0, -1).join(' -> ') : ''
  const exitNode = chainPath[chainPath.length - 1] || ''
  const trafficWithBytes = (value?: number) => {
    const bytes = value ?? 0
    return `${parseTraffic(bytes).join(' ')} (${bytes.toLocaleString()} bytes)`
  }

  const routeSteps = [
    { label: t('connections.components.route.app'), value: process },
    {
      label: t('connections.components.route.inbound'),
      value: getConnectionTypeLabel(data),
    },
    { label: t('connections.components.route.rule'), value: rule },
    { label: t('connections.components.route.policy'), value: policy },
    { label: t('connections.components.route.exit'), value: exitNode },
    { label: t('connections.components.route.remote'), value: host },
  ]

  const leftInformation = [
    {
      label: t('connections.components.fields.source'),
      value: getConnectionSource(data),
    },
    {
      label: t('shared.labels.downloaded'),
      value: trafficWithBytes(data.download),
    },
    {
      label: t('shared.labels.uploaded'),
      value: trafficWithBytes(data.upload),
    },
    {
      label: t('connections.components.fields.dlSpeed'),
      value: `${parseTraffic(data.curDownload ?? 0).join(' ')}/s`,
    },
    {
      label: t('connections.components.fields.ulSpeed'),
      value: `${parseTraffic(data.curUpload ?? 0).join(' ')}/s`,
    },
  ].filter((item) => item.value)

  const rightInformation = [
    {
      label: t('connections.components.fields.destination'),
      value: destination || '',
    },
    {
      label: t('connections.components.fields.process'),
      value: processDetail,
    },
    {
      label: t('connections.components.fields.time'),
      value: dayjs(data.start).fromNow(),
    },
    {
      label: t('connections.components.fields.destinationPort'),
      value: `${metadata.destinationPort}`,
    },
    {
      label: t('connections.components.fields.chains'),
      value: chains,
    },
  ].filter((item) => item.value)

  const onDelete = useLockFn(async () => closeConnection(data.id))
  const detailColumn = (items: typeof leftInformation) => (
    <div className="grid min-w-0 grid-cols-[minmax(128px,max-content)_minmax(0,1fr)] gap-x-inset gap-y-component">
      {items.map((each) => (
        <Fragment key={each.label}>
          <span className="text-[12.5px] font-bold leading-[1.35] text-[var(--color-text-secondary)]">
            {each.label}
          </span>
          <span className="min-w-0 text-[13px] leading-[1.35] text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
            {each.value}
          </span>
        </Fragment>
      ))}
    </div>
  )

  return (
    <div className="box-border max-h-[48vh] w-full select-text overflow-auto rounded-[var(--radius-container)] border border-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-bg-card)_98%,transparent)] p-stack text-[var(--color-text-primary)] shadow-[var(--shadow-modal)] sm:p-inset">
      <div className="mb-stack flex min-w-0 items-center gap-stack">
        <div
          title={host}
          className="min-w-0 truncate text-[15px] font-bold leading-[1.3] text-[var(--color-text-primary)]"
        >
          {host}
        </div>
        <span className="inline-flex shrink-0 items-center gap-compact text-[12.5px] text-[var(--color-text-secondary)]">
          <span
            className={`size-1.5 rounded-full ${
              closed
                ? 'bg-[var(--color-text-disabled)]'
                : 'bg-[var(--color-success)]'
            }`}
          />
          {closed ? 'Closed' : 'Live'}
        </span>
        <span className="shrink-0 text-[12.5px] text-[var(--color-text-secondary)]">
          {dayjs(data.start).fromNow()}
        </span>
        <span className="shrink-0 text-[12.5px] text-[var(--color-text-secondary)]">
          Type: {getConnectionTypeLabel(data)}
        </span>
        <div className="flex-1" />
        {!closed && (
          <Button
            size="sm"
            variant="outline"
            title={t('connections.components.actions.closeConnection')}
            onClick={() => {
              onDelete()
              onClose?.()
            }}
            className="h-[30px] shrink-0"
          >
            {t('connections.components.actions.closeConnection')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close detail"
          onClick={onClose}
          className="shrink-0"
        >
          <ChevronDown className="size-5" />
        </Button>
      </div>
      <div className="mb-component text-[13px] font-bold leading-[1.3] text-[var(--color-text-primary)]">
        {t('connections.components.route.title')}
      </div>
      <ConnectionRouteTimeline steps={routeSteps} />

      <div className="mt-inset border-t border-[var(--color-border)] pt-2.5">
        <div className="grid grid-cols-1 gap-component md:grid-cols-2 md:gap-block">
          {detailColumn(leftInformation)}
          {detailColumn(rightInformation)}
        </div>
      </div>
    </div>
  )
}
