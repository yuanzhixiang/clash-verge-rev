import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  type: 'prepend' | 'original' | 'delete' | 'append'
  proxy: IProxyConfig
  onDelete: () => void
}

export const ProxyItem = (props: Props) => {
  const { type, proxy, onDelete } = props
  const sortable = type === 'prepend' || type === 'append'

  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef: sortableSetNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: proxy.name,
    disabled: !sortable,
  })
  const dragAttributes = sortable ? sortableAttributes : undefined
  const dragListeners = sortable ? sortableListeners : undefined
  const dragNodeRef = sortable ? sortableSetNodeRef : undefined

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
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined,
      }}
    >
      <div
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
        ref={dragNodeRef}
        className={cn('min-w-0 flex-1', sortable && 'cursor-move')}
      >
        <div
          title={proxy.name}
          className={cn(
            'truncate text-[15px] font-bold leading-[1.5]',
            type === 'delete' && 'line-through',
          )}
        >
          {proxy.name}
        </div>
        <div className="flex items-center overflow-hidden pt-adjust">
          <div className="mt-adjust">
            <span className="inline-block rounded-[var(--radius-container)] border border-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] px-inline text-[10px] leading-[1.5] text-[color-mix(in_srgb,var(--color-accent)_80%,transparent)]">
              {proxy.type}
            </span>
          </div>
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
