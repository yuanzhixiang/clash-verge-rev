import { Check, ExternalLink, Pencil, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface Props {
  value?: string
  onlyEdit?: boolean
  onChange: (value?: string) => void
  onOpenUrl?: (value?: string) => void
  onDelete?: () => void
  onCancel?: () => void
}

export const WebUIItem = (props: Props) => {
  const {
    value,
    onlyEdit = false,
    onChange,
    onDelete,
    onOpenUrl,
    onCancel,
  } = props

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const { t } = useTranslation()

  const highlightedParts = useMemo(() => {
    const placeholderRegex = /(%host|%port|%secret)/g
    if (!value) {
      return ['NULL']
    }
    return value.split(placeholderRegex).filter((part) => part !== '')
  }, [value])

  if (editing || onlyEdit) {
    return (
      <>
        <div className="my-component flex items-center gap-compact">
          <Input
            autoComplete="new-password"
            className="h-8"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={t(
              'settings.modals.webUI.messages.supportedPlaceholders',
            )}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('shared.actions.save')}
            className="text-current"
            onClick={() => {
              onChange(editValue)
              setEditing(false)
            }}
          >
            <Check className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('shared.actions.cancel')}
            className="text-current"
            onClick={() => {
              onCancel?.()
              setEditing(false)
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
        <Separator />
      </>
    )
  }

  const renderedParts = highlightedParts.map((part, index) => {
    const isPlaceholder =
      part === '%host' || part === '%port' || part === '%secret'
    const repeatIndex = highlightedParts
      .slice(0, index)
      .filter((prev) => prev === part).length
    const key = `${part || 'empty'}-${repeatIndex}`

    return (
      <span key={key} className={isPlaceholder ? 'placeholder' : undefined}>
        {part}
      </span>
    )
  })

  return (
    <>
      <div className="my-component flex items-center gap-compact">
        <div
          title={value}
          className={cn(
            'w-full truncate',
            value
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)]',
            '[&>.placeholder]:text-[var(--color-accent)]',
          )}
        >
          {renderedParts}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t('settings.modals.webUI.actions.openUrl')}
          className="text-current"
          onClick={() => onOpenUrl?.(value)}
        >
          <ExternalLink className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t('shared.actions.edit')}
          className="text-current"
          onClick={() => {
            setEditing(true)
            setEditValue(value)
          }}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t('shared.actions.delete')}
          className="text-current"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <Separator />
    </>
  )
}
