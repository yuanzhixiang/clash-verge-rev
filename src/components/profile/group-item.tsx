import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useIconCache } from '@/hooks/use-icon-cache'
import { cn } from '@/lib/utils'

interface Props {
  type: 'prepend' | 'original' | 'delete' | 'append'
  group: IProxyGroupConfig
  onDelete: () => void
}

export const GroupItem = (props: Props) => {
  const { type, group, onDelete } = props
  const sortable = type === 'prepend' || type === 'append'

  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef: sortableSetNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.name,
    disabled: !sortable,
  })
  const dragAttributes = sortable ? sortableAttributes : undefined
  const dragListeners = sortable ? sortableListeners : undefined
  const dragNodeRef = sortable ? sortableSetNodeRef : undefined

  const iconCachePath = useIconCache({
    icon: group.icon,
    cacheKey: group.name.replaceAll(' ', ''),
  })

  const background =
    type === 'original'
      ? 'bg-[color-mix(in_srgb,var(--color-text-primary)_12%,transparent)]'
      : type === 'delete'
        ? 'bg-[color-mix(in_srgb,var(--color-danger)_30%,transparent)]'
        : 'bg-[color-mix(in_srgb,var(--color-success)_30%,transparent)]'

  return (
    <div
      className={cn(
        'relative my-component flex h-full items-center rounded-[var(--radius-control)] px-inset py-inline',
        background,
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined,
      }}
    >
      {group.icon && group.icon?.trim().startsWith('http') && (
        <img
          src={iconCachePath === '' ? group.icon : iconCachePath}
          className="mr-stack w-8 rounded-[var(--radius-compact)]"
        />
      )}
      {group.icon && group.icon?.trim().startsWith('data') && (
        <img
          src={group.icon}
          className="mr-stack w-8 rounded-[var(--radius-compact)]"
        />
      )}
      {group.icon && group.icon?.trim().startsWith('<svg') && (
        <img
          src={`data:image/svg+xml;base64,${btoa(group.icon ?? '')}`}
          className="mr-stack w-8 rounded-[var(--radius-compact)]"
        />
      )}

      <div
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
        ref={dragNodeRef}
        className={cn('min-w-0 flex-1', sortable && 'cursor-move')}
      >
        <div
          className={cn(
            'truncate text-[15px] leading-normal font-bold',
            type === 'delete' && 'line-through',
          )}
        >
          {group.name}
        </div>
        <div className="flex items-center pt-adjust">
          <span className="mr-component inline-block rounded-[var(--radius-container)] border border-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] px-inline text-[10px] leading-normal text-[color-mix(in_srgb,var(--color-accent)_80%,transparent)]">
            {group.type}
          </span>
        </div>
      </div>

      <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
        {type === 'delete' ? (
          <Undo2 className="size-5" />
        ) : (
          <Trash2 className="size-5" />
        )}
      </Button>
    </div>
  )
}
