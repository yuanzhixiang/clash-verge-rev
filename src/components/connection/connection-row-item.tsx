import { useLockFn } from 'ahooks'
import { X } from 'lucide-react'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { closeConnection } from 'tauri-plugin-mihomo-api'

import { Button } from '@/components/ui/button'

import { RelativeTime } from './connection-relative-time'
import type { ConnectionRowView } from './connection-row-view'

interface Props {
  row: ConnectionRowView
  closed: boolean
  selected?: boolean
  onShowDetail: (id: string) => void
}

const tagClass =
  'box-border max-w-full truncate rounded-[var(--radius-container)] border border-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] px-compact py-px text-[10px] font-semibold leading-[1.45] text-[var(--color-accent)]'

export const ConnectionRowItem = memo(
  function ConnectionRowItem({ row, closed, selected, onShowDetail }: Props) {
    const { t } = useTranslation()
    const onDelete = useLockFn(async () => closeConnection(row.id))
    const handleShowDetail = useCallback(
      () => onShowDetail(row.id),
      [onShowDetail, row.id],
    )
    const showTraffic = row.uploadSpeed >= 100 || row.downloadSpeed >= 100

    return (
      <div
        className={`relative flex min-h-14 items-center gap-component overflow-hidden border-b border-[var(--color-border)] py-compact pr-12 pl-stack ${
          selected ? 'bg-[var(--color-accent-subtle)]' : ''
        }`}
      >
        <div
          className="min-w-0 flex-1 cursor-pointer select-text"
          onClick={handleShowDetail}
        >
          <div className="truncate text-[14px] leading-[1.4]">{row.host}</div>
          <div className="mt-inline flex flex-wrap gap-inline overflow-hidden">
            <span className={tagClass}>{row.network}</span>
            <span className={tagClass}>{row.type}</span>
            {row.process && <span className={tagClass}>{row.process}</span>}
            {row.chains && <span className={tagClass}>{row.chains}</span>}
            <span className={tagClass}>
              <RelativeTime start={row.time} />
            </span>
            {showTraffic && (
              <span className={tagClass}>
                {row.uploadSpeedText} / {row.downloadSpeedText}
              </span>
            )}
          </div>
        </div>
        {!closed && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-component -translate-y-1/2"
            onClick={onDelete}
            title={t('connections.components.actions.closeConnection')}
            aria-label={t('connections.components.actions.closeConnection')}
          >
            <X className="size-5" />
          </Button>
        )}
      </div>
    )
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.closed === next.closed &&
    prev.selected === next.selected &&
    prev.onShowDetail === next.onShowDetail,
)
