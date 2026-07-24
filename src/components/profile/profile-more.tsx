import { useLockFn } from 'ahooks'
import { Ellipsis, List } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EditorViewer } from '@/components/profile/editor-viewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEditorDocument } from '@/hooks/use-editor-document'
import { cn } from '@/lib/utils'
import {
  readProfileFile,
  revealProfileFile,
  saveProfileFile,
  viewProfile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { LogViewer } from './log-viewer'
import { ProfileBox } from './profile-box'

interface Props {
  logInfo?: [string, string][]
  id: 'Merge' | 'Script'
  onSave?: (prev?: string, curr?: string) => void
}

const EMPTY_LOG_INFO: [string, string][] = []

// Default global extend script content (mirrors `ITEM_SCRIPT` in
// src-tauri/src/utils/tmpl.rs).
const DEFAULT_SCRIPT = `// Define main function (script entry)

function main(config, profileName) {
  return config;
}
`

// profile enhanced item
export const ProfileMore = (props: Props) => {
  const { id, logInfo, onSave } = props

  const entries = logInfo ?? EMPTY_LOG_INFO
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [fileOpen, setFileOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  const loadDocument = useCallback(() => readProfileFile(id), [id])
  const document = useEditorDocument({
    open: fileOpen,
    load: loadDocument,
  })

  const onEditFile = () => {
    setMenuOpen(false)
    setFileOpen(true)
  }

  const onOpenFile = useLockFn(async () => {
    setMenuOpen(false)
    try {
      await viewProfile(id)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const onRevealFile = useLockFn(async () => {
    setMenuOpen(false)
    try {
      await revealProfileFile(id)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const hasError = entries.some(([level]) => level === 'exception')

  const globalTitles: Record<Props['id'], string> = {
    Merge: 'profiles.components.more.global.merge',
    Script: 'profiles.components.more.global.script',
  }

  const chipLabels: Record<Props['id'], string> = {
    Merge: 'profiles.components.more.chips.merge',
    Script: 'profiles.components.more.chips.script',
  }

  const itemMenu = [
    { label: 'profiles.components.menu.editFile', handler: onEditFile },
    { label: 'profiles.components.menu.openFile', handler: onOpenFile },
    {
      label: 'profiles.components.menu.revealInFinder',
      handler: onRevealFile,
    },
  ]

  const handleSave = useLockFn(async () => {
    const currentValue = document.value
    if (!(await saveProfileFile(id, currentValue))) {
      await document.reload()
      return
    }
    onSave?.(document.savedValue, currentValue)
    document.markSaved(currentValue)
  })

  const handleResetToDefault = useCallback(() => {
    document.setValue(DEFAULT_SCRIPT)
  }, [document])

  return (
    <>
      <ProfileBox
        onDoubleClick={onEditFile}
        onContextMenu={(event) => {
          const { clientX, clientY } = event
          setPosition({ top: clientY, left: clientX })
          setMenuOpen(true)
          event.preventDefault()
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-component">
          <div className="min-w-0">
            <h2
              title={t(globalTitles[id])}
              className="truncate text-[14px] font-[550] leading-[1.35]"
            >
              {t(globalTitles[id])}
            </h2>
            <p className="mt-adjust text-[11.5px] leading-[1.4] text-[var(--color-text-secondary)]">
              {t(chipLabels[id])}
            </p>
          </div>

          {id === 'Script' && (
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                title={t('profiles.modals.logViewer.title')}
                className={cn(hasError && 'text-[var(--color-danger)]')}
                onClick={() => setLogOpen(true)}
              >
                <List className="size-4" />
              </Button>
              {hasError && (
                <span className="pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-[var(--color-danger)]" />
              )}
            </div>
          )}

          <div className="flex items-center">
            <Badge
              variant="secondary"
              className="h-5 font-normal text-[var(--color-text-secondary)]"
            >
              {t(chipLabels[id])}
            </Badge>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t('shared.actions.showDetails')}
              className="ml-inline text-[var(--color-text-secondary)]"
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setPosition({ top: rect.bottom, left: rect.right })
                setMenuOpen(true)
              }}
            >
              <Ellipsis className="size-4" />
            </Button>
          </div>
        </div>
      </ProfileBox>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed h-0 w-0"
            style={{ left: position.left, top: position.top }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[120px]">
          {itemMenu
            .filter((item: any) => item.show !== false)
            .map((item) => (
              <DropdownMenuItem key={item.label} onClick={item.handler}>
                {t(item.label)}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {fileOpen && (
        <EditorViewer
          open={true}
          title={t(globalTitles[id])}
          value={document.value}
          language={id === 'Merge' ? 'yaml' : 'javascript'}
          path={`profile-more:${id}.${id === 'Merge' ? 'yaml' : 'js'}`}
          loading={document.loading}
          dirty={document.dirty}
          onChange={document.setValue}
          onSave={handleSave}
          onResetToDefault={id === 'Script' ? handleResetToDefault : undefined}
          onClose={() => setFileOpen(false)}
        />
      )}
      {logOpen && (
        <LogViewer
          open={logOpen}
          logInfo={entries}
          onClose={() => setLogOpen(false)}
        />
      )}
    </>
  )
}
