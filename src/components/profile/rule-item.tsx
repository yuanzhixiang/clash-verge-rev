import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  type: 'prepend' | 'original' | 'delete' | 'append'
  ruleRaw: string
  onDelete: () => void
}

export const RuleItem = (props: Props) => {
  const { type, ruleRaw, onDelete } = props
  const sortable = type === 'prepend' || type === 'append'
  const rule = ruleRaw.replace(',no-resolve', '')

  const ruleType = rule.match(/^[^,]+/)?.[0] ?? ''
  const proxyPolicy = rule.match(/[^,]+$/)?.[0] ?? ''
  const ruleContent = rule.slice(ruleType.length + 1, -proxyPolicy.length - 1)

  const $sortable = useSortable({ id: ruleRaw })

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable
    ? $sortable
    : {
        attributes: {},
        listeners: {},
        setNodeRef: null,
        transform: null,
        transition: null,
        isDragging: false,
      }

  const bgClass =
    type === 'original'
      ? 'bg-[var(--color-bg-subtle)]'
      : type === 'delete'
        ? 'bg-[color-mix(in_srgb,var(--color-danger)_30%,transparent)]'
        : 'bg-[color-mix(in_srgb,var(--color-success)_30%,transparent)]'

  return (
    <div
      className={cn(
        'relative my-component flex items-center gap-component rounded-[var(--radius-control)] px-inset py-inline',
        bgClass,
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        zIndex: isDragging ? 'calc(infinity)' : undefined,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        ref={setNodeRef}
        className={cn('min-w-0 flex-1', sortable && 'cursor-move')}
      >
        <div
          title={ruleContent || '-'}
          className={cn(
            'truncate text-[15px] font-bold leading-[1.5]',
            type === 'delete' && 'line-through',
          )}
        >
          {ruleContent || '-'}
        </div>
        <div className="flex w-[62%] justify-between overflow-hidden pt-adjust">
          <div className="mt-adjust">
            <span className="inline-block rounded-[var(--radius-container)] border border-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] px-inline text-[10px] leading-[1.5] text-[color-mix(in_srgb,var(--color-accent)_80%,transparent)]">
              {ruleType}
            </span>
          </div>
          <span className="truncate text-[13px] text-[var(--color-text-secondary)]">
            {proxyPolicy}
          </span>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onDelete}>
        {type === 'delete' ? (
          <Undo2 className="size-5" />
        ) : (
          <Trash2 className="size-5" />
        )}
      </Button>
    </div>
  )
}
