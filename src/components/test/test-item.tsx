import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { UnlistenFn } from '@tauri-apps/api/event'
import { useLockFn } from 'ahooks'
import { Globe } from 'lucide-react'
import { type HTMLAttributes, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseLoading } from '@/components/base'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { useIconCache } from '@/hooks/use-icon-cache'
import { useListen } from '@/hooks/use-listen'
import { cn } from '@/lib/utils'
import { cmdTestDelay } from '@/services/cmds'
import delayManager from '@/services/delay'
import { showNotice } from '@/services/notice-service'
import { debugLog } from '@/utils/debug'

import { TestBox } from './test-box'

interface Props {
  id: string
  itemData: IVergeTestItem
  onEdit: () => void
  onDelete: (uid: string) => void
}

// delayManager.formatDelayColor 返回 MUI 调色板路径字符串，
// 映射到语义 token（避免改动共享的 delay service）。
const delayColorVar = (path: string): string | undefined => {
  switch (path) {
    case 'error.main':
      return 'var(--color-danger)'
    case 'warning.main':
      return 'var(--color-warning)'
    case 'primary.main':
      return 'var(--color-accent)'
    case 'success.main':
      return 'var(--color-success)'
    default:
      return undefined
  }
}

const Widget = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'rounded-[var(--radius-compact)] px-compact py-[3px] text-body',
      className,
    )}
    {...props}
  />
)

const widgetHover =
  'hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]'

export const TestItem = ({
  id,
  itemData,
  onEdit,
  onDelete: removeTest,
}: Props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
  })

  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [delay, setDelay] = useState(-1)
  const { uid, name, icon, url } = itemData
  const iconCachePath = useIconCache({ icon, cacheKey: uid })
  const { addListener } = useListen()

  const onDelay = useCallback(async () => {
    setDelay(-2)
    const result = await cmdTestDelay(url)
    setDelay(result)
  }, [url])

  const onEditTest = () => {
    setMenuOpen(false)
    onEdit()
  }

  const onDelete = useLockFn(async () => {
    setMenuOpen(false)
    try {
      removeTest(uid)
    } catch (err: any) {
      showNotice.error(err)
    }
  })

  const menu = [
    { label: 'Edit', handler: onEditTest },
    { label: 'Delete', handler: onDelete },
  ]

  useEffect(() => {
    let unlistenFn: UnlistenFn | null = null

    const setupListener = async () => {
      if (unlistenFn) {
        unlistenFn()
      }
      unlistenFn = await addListener('verge://test-all', () => {
        onDelay()
      })
    }

    setupListener()

    return () => {
      if (unlistenFn) {
        debugLog(
          `TestItem for ${id} unmounting or url changed, cleaning up test-all listener.`,
        )
        unlistenFn()
      }
    }
  }, [url, addListener, onDelay, id])

  return (
    <div
      className="relative"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined,
      }}
    >
      <TestBox
        onContextMenu={(event) => {
          event.preventDefault()
          setPosition({ top: event.clientY, left: event.clientX })
          setMenuOpen(true)
        }}
      >
        <div
          className="relative cursor-move"
          ref={setNodeRef}
          {...attributes}
          {...listeners}
        >
          {icon && icon.trim() !== '' ? (
            <div className="flex justify-center">
              {icon.trim().startsWith('http') && (
                <img
                  src={iconCachePath === '' ? icon : iconCachePath}
                  height="40px"
                />
              )}
              {icon.trim().startsWith('data') && (
                <img src={icon} height="40px" />
              )}
              {icon.trim().startsWith('<svg') && (
                <img
                  src={`data:image/svg+xml;base64,${btoa(icon)}`}
                  height="40px"
                />
              )}
            </div>
          ) : (
            <div className="flex justify-center">
              <Globe className="size-10" />
            </div>
          )}

          <div className="flex justify-center">{name}</div>
        </div>
        <Separator className="mt-component" />
        <div className="mt-component flex justify-center text-[var(--color-accent)]">
          {delay === -2 && (
            <Widget>
              <BaseLoading />
            </Widget>
          )}

          {delay === -1 && (
            <Widget
              className={cn('the-check', widgetHover)}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelay()
              }}
            >
              {t('tests.components.item.actions.test')}
            </Widget>
          )}

          {delay >= 0 && (
            // 显示延迟
            <Widget
              className={cn('the-delay', widgetHover)}
              style={{
                color: delayColorVar(delayManager.formatDelayColor(delay)),
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelay()
              }}
            >
              {delayManager.formatDelay(delay)}
            </Widget>
          )}
        </div>
      </TestBox>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed h-0 w-0"
            style={{ left: position.left, top: position.top }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[120px]"
          onContextMenu={(e) => {
            setMenuOpen(false)
            e.preventDefault()
          }}
        >
          {menu.map((item) => (
            <DropdownMenuItem key={item.label} onClick={item.handler}>
              {t(item.label)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
