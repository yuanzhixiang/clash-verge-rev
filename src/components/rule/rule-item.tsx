import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { RuntimeRule } from '@/types/rule'

// 命中策略哈希配色：仅使用语义 token（缺少 secondary/purple token，
// 以 accent-strong 顶替原 MUI secondary 槽位，纯装饰性差异）。
const POLICY_COLORS = [
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-warning)',
  'var(--color-success)',
  'var(--color-accent-strong)',
]

const cellBase = 'min-w-0 truncate select-text px-2 text-[13px] leading-8'

interface Props {
  value: RuntimeRule
  displayIndex: number
  selected: boolean
  onSelect: (value: RuntimeRule) => void
  onEdit: (value: RuntimeRule) => void
}

const parseColor = (text: string) => {
  if (text === 'REJECT' || text === 'REJECT-DROP') return 'var(--color-danger)'
  if (text === 'DIRECT') return 'var(--color-text-primary)'

  let sum = 0
  for (let i = 0; i < text.length; i++) {
    sum += text.charCodeAt(i)
  }
  return POLICY_COLORS[sum % POLICY_COLORS.length]
}

const RuleItem = ({
  value,
  displayIndex,
  selected,
  onSelect,
  onEdit,
}: Props) => {
  const { t } = useTranslation()
  const payload = value.payload || '-'
  const used = value.extra?.hitCount
  const usedLabel = used == null ? '—' : String(used)

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-description={t('rules.page.actions.edit.hint')}
      aria-keyshortcuts="F2"
      data-selected={selected ? 'true' : 'false'}
      data-striped={displayIndex % 2 === 1 ? 'true' : 'false'}
      onClick={() => onSelect(value)}
      onDoubleClick={() => onEdit(value)}
      onKeyDown={(event) => {
        if (event.key === 'F2') {
          event.preventDefault()
          onEdit(value)
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(value)
        }
      }}
      className={cn(
        'box-border grid h-8 w-full cursor-default items-center outline-none transition-colors',
        'grid-cols-[var(--rules-grid-columns)] text-[var(--color-text-primary)]',
        'data-[selected=false]:data-[striped=true]:bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]',
        'data-[selected=false]:hover:bg-[var(--color-bg-hover)]',
        'data-[selected=true]:bg-[var(--color-bg-active)]',
        'focus-visible:-outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]',
      )}
    >
      <div
        role="cell"
        title={String(value.index)}
        className={cn(
          cellBase,
          'text-center tabular-nums text-[var(--color-text-secondary)]',
        )}
      >
        {value.index}
      </div>
      <div
        role="cell"
        title={value.type}
        className={cn(cellBase, 'font-[560]')}
      >
        {value.type}
      </div>
      <div role="cell" title={payload} className={cellBase}>
        {payload}
      </div>
      <div
        role="cell"
        title={value.proxy}
        className={cellBase}
        style={{ color: parseColor(value.proxy) }}
      >
        {value.proxy}
      </div>
      <div
        role="cell"
        title={usedLabel}
        className={cn(
          cellBase,
          'text-right tabular-nums text-[var(--color-text-secondary)]',
        )}
      >
        {usedLabel}
      </div>
    </div>
  )
}

export default RuleItem
