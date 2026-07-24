import { Code, LayoutGrid, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type BaseSplitChipEditorMode = 'visual' | 'advanced'

interface BaseSplitChipEditorProps {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: boolean
  helperText?: ReactNode
  placeholder?: string
  rows?: number
  separator?: string
  splitPattern?: RegExp
  defaultMode?: BaseSplitChipEditorMode
  showModeToggle?: boolean
  ariaLabel?: string
  addLabel?: ReactNode
  emptyLabel?: ReactNode
  modeLabels?: Partial<Record<BaseSplitChipEditorMode, ReactNode>>
  renderHeader?: (modeToggle: ReactNode) => ReactNode
}

const DEFAULT_SPLIT_PATTERN = /[,\n;\r]+/

const splitValue = (value: string, splitPattern: RegExp) =>
  value
    .split(splitPattern)
    .map((item) => item.trim())
    .filter(Boolean)

export const BaseSplitChipEditor = ({
  value = '',
  onChange,
  disabled = false,
  error = false,
  helperText,
  placeholder,
  rows = 4,
  separator = ',',
  splitPattern = DEFAULT_SPLIT_PATTERN,
  defaultMode = 'visual',
  showModeToggle = true,
  ariaLabel,
  addLabel,
  emptyLabel,
  modeLabels,
  renderHeader,
}: BaseSplitChipEditorProps) => {
  const { t } = useTranslation()
  const [mode, setMode] = useState<BaseSplitChipEditorMode>(defaultMode)
  const [draft, setDraft] = useState('')

  const resolvedLabels = useMemo(
    () => ({
      visual: modeLabels?.visual ?? t('shared.editorModes.visualization'),
      advanced: modeLabels?.advanced ?? t('shared.editorModes.advanced'),
      add: addLabel ?? t('shared.actions.new'),
      empty: emptyLabel ?? t('shared.statuses.empty'),
    }),
    [t, modeLabels, addLabel, emptyLabel],
  )

  const values = useMemo(
    () => splitValue(value, splitPattern),
    [value, splitPattern],
  )

  const items = useMemo(() => {
    const counts = new Map<string, number>()
    return values.map((item) => {
      const nextCount = (counts.get(item) ?? 0) + 1
      counts.set(item, nextCount)
      return {
        key: `${item}-${nextCount}`,
        value: item,
      }
    })
  }, [values])

  const handleAddDraft = () => {
    const nextValues = splitValue(draft, splitPattern)
    if (!nextValues.length) {
      return
    }
    const nextValue = [...values, ...nextValues].join(separator)
    onChange(nextValue)
    setDraft('')
  }

  const handleRemoveItem = (index: number) => {
    const nextValue = values.filter((_, itemIndex) => itemIndex !== index)
    onChange(nextValue.join(separator))
  }

  const nextMode = mode === 'visual' ? 'advanced' : 'visual'
  const toggleLabel =
    nextMode === 'visual' ? resolvedLabels.visual : resolvedLabels.advanced
  const ToggleIcon = nextMode === 'visual' ? LayoutGrid : Code
  const resolvedAriaLabel =
    ariaLabel ?? (typeof toggleLabel === 'string' ? toggleLabel : undefined)

  const helperNode = helperText ? (
    <p
      className={cn(
        'mt-adjust text-xs',
        error ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]',
      )}
    >
      {helperText}
    </p>
  ) : null

  const modeToggle = showModeToggle ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={resolvedAriaLabel}
          onClick={() => {
            setMode(nextMode)
            if (nextMode === 'visual') {
              setDraft('')
            }
          }}
        >
          <ToggleIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{toggleLabel}</TooltipContent>
    </Tooltip>
  ) : null

  return (
    <>
      {renderHeader ? renderHeader(modeToggle) : modeToggle}
      {mode === 'visual' ? (
        <div className="px-adjust pb-compact">
          <div className="flex min-h-8 flex-wrap gap-component">
            {items.length ? (
              items.map((item, index) => (
                <Badge
                  key={item.key}
                  variant="secondary"
                  className="max-w-full"
                >
                  <span className="truncate">{item.value}</span>
                  {disabled ? null : (
                    <button
                      type="button"
                      aria-label={`${t('shared.actions.delete')} ${item.value}`}
                      onClick={() => handleRemoveItem(index)}
                      className="inline-flex items-center justify-center rounded-[var(--radius-compact)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                {resolvedLabels.empty}
              </p>
            )}
          </div>
          <div className="mt-component flex items-center gap-component">
            <Input
              disabled={disabled}
              className="h-8"
              value={draft}
              placeholder={placeholder}
              aria-invalid={error || undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddDraft()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddDraft}
              disabled={disabled || !draft.trim()}
            >
              {resolvedLabels.add}
            </Button>
          </div>
          {helperNode}
        </div>
      ) : (
        <div>
          <Textarea
            disabled={disabled}
            rows={rows}
            className="w-full"
            value={value}
            aria-invalid={error || undefined}
            onChange={(event) => {
              onChange(event.target.value)
            }}
          />
          {helperNode}
        </div>
      )}
    </>
  )
}
