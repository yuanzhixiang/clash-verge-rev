import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  toggling: boolean
  canToggle: boolean
  onSelect: (value: RuntimeRule) => void
  onEdit: (value: RuntimeRule) => void
  onToggleEnabled: (value: RuntimeRule, enabled: boolean) => void
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
  toggling,
  canToggle,
  onSelect,
  onEdit,
  onToggleEnabled,
}: Props) => {
  const { t } = useTranslation()
  const payload = value.payload || '-'
  const used = value.extra?.hitCount
  const usedLabel = used == null ? '—' : String(used)
  // 禁用状态以内核实际标记为准：规则仍留在列表里，只是不参与匹配。
  const disabled = value.extra?.disabled === true
  // 只压暗信息列，开关本身保持满对比度，否则禁用之后反而更难点回来。
  const muted = disabled ? 'opacity-50' : undefined

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-description={t('rules.page.actions.edit.hint')}
      aria-keyshortcuts="F2"
      data-selected={selected ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
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
          muted,
        )}
      >
        {value.index}
      </div>
      <div
        role="cell"
        title={value.type}
        className={cn(cellBase, 'font-[560]', muted)}
      >
        {value.type}
      </div>
      <div
        role="cell"
        title={payload}
        className={cn(cellBase, disabled && 'line-through', muted)}
      >
        {payload}
      </div>
      <div
        role="cell"
        title={value.proxy}
        className={cn(cellBase, muted)}
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
          muted,
        )}
      >
        {usedLabel}
      </div>
      {/* 开关列不能把点击冒泡成选中/编辑，否则切换时会顺带改掉选中行。 */}
      <div
        role="cell"
        className="flex min-w-0 items-center justify-center px-2"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Switch
                size="sm"
                checked={!disabled}
                disabled={!canToggle || toggling}
                aria-label={t(
                  disabled
                    ? 'rules.page.actions.toggle.enable'
                    : 'rules.page.actions.toggle.disable',
                )}
                onCheckedChange={(next) => onToggleEnabled(value, next)}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t(
              !canToggle
                ? 'rules.feedback.notifications.mutationUnavailable'
                : disabled
                  ? 'rules.page.actions.toggle.enable'
                  : 'rules.page.actions.toggle.disable',
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export default RuleItem
