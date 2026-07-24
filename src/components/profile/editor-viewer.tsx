import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useLockFn } from 'ahooks'
import {
  ClipboardPaste,
  Maximize2,
  Minimize,
  Paintbrush,
  RotateCcw,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseLoadingOverlay, MonacoEditor } from '@/components/base'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { showNotice } from '@/services/notice-service'
import type { MonacoEditorInstance, MonacoMarker } from '@/types/monaco'
import debounce from '@/utils/debounce'
import getSystem from '@/utils/get-system'

export type EditorLanguage = 'yaml' | 'surge-conf' | 'javascript' | 'css'

export interface EditorViewerProps {
  open: boolean
  title?: string | ReactNode
  value: string
  language: EditorLanguage
  path: string
  readOnly?: boolean
  loading?: boolean
  dirty?: boolean
  saveDisabled?: boolean
  onChange?: (value: string) => void
  onSave?: () => void | Promise<void>
  onResetToDefault?: () => void
  onClose: () => void
  onValidate?: (markers: MonacoMarker[]) => void
}

export const EditorViewer = ({
  open,
  title,
  value,
  language,
  path,
  readOnly = false,
  loading = false,
  dirty,
  saveDisabled = false,
  onChange,
  onSave,
  onResetToDefault,
  onClose,
  onValidate,
}: EditorViewerProps) => {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const appWindow = useMemo(() => getCurrentWebviewWindow(), [])
  const [isMaximized, setIsMaximized] = useState(false)
  const editorRef = useRef<MonacoEditorInstance | null>(null)

  const resolvedTitle = title ?? t('profiles.components.menu.editFile')
  const disableSave = loading || saveDisabled || dirty === false

  const syncEditorValue = useCallback(() => {
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== value) {
      model.setValue(value)
    }
  }, [value])

  const syncMaximizedState = useCallback(async () => {
    try {
      setIsMaximized(await appWindow.isMaximized())
    } catch {
      setIsMaximized(false)
    }
  }, [appWindow])

  const handleSave = useLockFn(async () => {
    try {
      if (!readOnly) {
        await onSave?.()
      }
      onClose()
    } catch (error) {
      showNotice.error(error)
    }
  })

  const handleClose = () => {
    try {
      onClose()
    } catch (error) {
      showNotice.error(error)
    }
  }

  const handlePaste = useLockFn(async () => {
    try {
      if (readOnly || loading || !editorRef.current) return

      const text = await navigator.clipboard.readText()
      if (!text) return

      const editorInstance = editorRef.current
      const model = editorInstance.getModel()
      const selections = editorInstance.getSelections()
      if (!model || !selections || selections.length === 0) return

      editorInstance.pushUndoStop()
      editorInstance.executeEdits(
        'explicit-paste',
        selections.map((selection) => ({
          range: selection,
          text,
          forceMoveMarkers: true,
        })),
      )
      editorInstance.pushUndoStop()
      editorInstance.focus()
    } catch (error) {
      showNotice.error(error)
    }
  })

  const handleFormat = useLockFn(async () => {
    try {
      if (loading) return
      await editorRef.current?.getAction('editor.action.formatDocument')?.run()
    } catch (error) {
      showNotice.error(error)
    }
  })

  const handleToggleMaximize = useLockFn(async () => {
    try {
      await appWindow.toggleMaximize()
      await syncMaximizedState()
      editorRef.current?.layout()
    } catch (error) {
      showNotice.error(error)
    }
  })

  useEffect(() => {
    if (!open) return
    void syncMaximizedState()
  }, [appWindow, open, syncMaximizedState])

  useEffect(() => {
    if (!open || loading) return
    syncEditorValue()
  }, [loading, open, syncEditorValue])

  useEffect(() => {
    if (!open) return

    const onResized = debounce(() => {
      void syncMaximizedState()
      try {
        editorRef.current?.layout()
      } catch {
        // Ignore transient layout errors during window transitions.
      }
    }, 100)

    const unlistenResized = appWindow.onResized(onResized)

    return () => {
      unlistenResized.then((unlisten) => unlisten())
    }
  }, [appWindow, open, syncMaximizedState])

  useEffect(() => {
    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  return (
    <BaseDialog
      open={open}
      title={resolvedTitle}
      disableEnforceFocus
      disableFooter
      contentSx={{ width: 'calc(100vw - 4rem)', maxWidth: 1400 }}
      onClose={handleClose}
    >
      <div className="relative flex h-[calc(100vh-185px)] flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1">
          <BaseLoadingOverlay isLoading={loading} />
          {!loading && (
            <MonacoEditor
              height="100%"
              path={path}
              value={value}
              language={language}
              theme={isDark ? 'vs-dark' : 'light'}
              loading={null}
              saveViewState
              keepCurrentModel={false}
              onMount={(editorInstance) => {
                editorRef.current = editorInstance
                syncEditorValue()
              }}
              onChange={(nextValue) => onChange?.(nextValue ?? '')}
              onValidate={onValidate}
              options={{
                automaticLayout: true,
                tabSize: 2,
                minimap: {
                  enabled:
                    typeof document !== 'undefined' &&
                    document.documentElement.clientWidth >= 1500,
                },
                mouseWheelZoom: true,
                readOnly,
                readOnlyMessage: {
                  value: t('profiles.modals.editor.messages.readOnly'),
                },
                renderValidationDecorations: 'on',
                quickSuggestions: {
                  strings: true,
                  comments: true,
                  other: true,
                },
                padding: {
                  top: 33,
                },
                fontFamily: `Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", "Apple Color Emoji"${
                  getSystem() === 'windows' ? ', twemoji mozilla' : ''
                }`,
                fontLigatures: false,
                smoothScrolling: true,
              }}
            />
          )}
        </div>

        <div className="absolute bottom-component left-[14px] flex items-center rounded-[var(--radius-control)] bg-[var(--color-bg-card)] shadow-[var(--shadow-dropdown)]">
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={t('profiles.page.importForm.actions.paste')}
              disabled={loading}
              onClick={() => {
                void handlePaste()
              }}
            >
              <ClipboardPaste className="size-5" />
            </Button>
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={t('profiles.modals.editor.actions.format')}
              disabled={loading}
              onClick={() => {
                void handleFormat()
              }}
            >
              <Paintbrush className="size-5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={t(
              isMaximized ? 'shared.window.minimize' : 'shared.window.maximize',
            )}
            onClick={() => {
              void handleToggleMaximize()
            }}
          >
            {isMaximized ? (
              <Minimize className="size-5" />
            ) : (
              <Maximize2 className="size-5" />
            )}
          </Button>
        </div>
      </div>

      <DialogFooter>
        {!readOnly && onResetToDefault && (
          <Button
            variant="outline"
            className="border-[var(--color-warning)] text-[var(--color-warning)] hover:bg-[var(--color-warning-subtle)] hover:text-[var(--color-warning)]"
            disabled={loading}
            onClick={onResetToDefault}
          >
            <RotateCcw className="size-4" />
            {t('shared.actions.resetToDefault')}
          </Button>
        )}
        <Button variant="outline" onClick={handleClose}>
          {t(readOnly ? 'shared.actions.close' : 'shared.actions.cancel')}
        </Button>
        {!readOnly && (
          <Button
            disabled={disableSave}
            onClick={() => {
              void handleSave()
            }}
          >
            {t('shared.actions.save')}
          </Button>
        )}
      </DialogFooter>
    </BaseDialog>
  )
}
