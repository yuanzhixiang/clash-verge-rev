import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConnectionColumnOption {
  id: string
  label: string
  visible: boolean
  toggleVisibility: (visible: boolean) => void
}

interface Props {
  open: boolean
  columns: ConnectionColumnOption[]
  onClose: () => void
  onOrderChange: (order: string[]) => void
  onReset: () => void
}

export const ConnectionColumnManager = ({
  open,
  columns,
  onClose,
  onOrderChange,
  onReset,
}: Props) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )
  const { t } = useTranslation()

  const items = useMemo(() => columns.map((column) => column.id), [columns])
  const visibleCount = useMemo(
    () => columns.filter((column) => column.visible).length,
    [columns],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const order = columns.map((column) => column.id)
      const oldIndex = order.indexOf(active.id as string)
      const newIndex = order.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      onOrderChange(arrayMove(order, oldIndex, newIndex))
    },
    [columns, onOrderChange],
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('connections.components.columnManager.title')}
          </DialogTitle>
        </DialogHeader>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items}>
            <ul className="flex flex-col gap-component">
              {columns.map((column) => (
                <SortableColumnItem
                  key={column.id}
                  column={column}
                  dragHandleLabel={t(
                    'connections.components.columnManager.dragHandle',
                  )}
                  disableToggle={column.visible && visibleCount <= 1}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <DialogFooter>
          <Button variant="ghost" onClick={onReset}>
            {t('shared.actions.resetToDefault')}
          </Button>
          <Button onClick={onClose}>{t('shared.actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SortableColumnItemProps {
  column: ConnectionColumnOption
  dragHandleLabel: string
  disableToggle?: boolean
}

const SortableColumnItem = ({
  column,
  dragHandleLabel,
  disableToggle = false,
}: SortableColumnItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id })

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  )

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-component rounded-[var(--radius-compact)] border border-[var(--color-border)] px-component py-inline ${
        isDragging ? 'bg-[var(--color-bg-hover)]' : ''
      }`}
    >
      <Checkbox
        checked={column.visible}
        disabled={disableToggle}
        onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
      />
      <span className="mr-component flex-1 text-[14px] text-[var(--color-text-primary)]">
        {column.label}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className={`shrink-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        aria-label={dragHandleLabel}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" />
      </Button>
    </li>
  )
}
