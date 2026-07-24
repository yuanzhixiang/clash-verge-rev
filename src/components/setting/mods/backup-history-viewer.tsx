import { save } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Download, History, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseLoadingOverlay } from '@/components/base'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useVerge } from '@/hooks/use-verge'
import {
  deleteLocalBackup,
  deleteWebdavBackup,
  exportLocalBackup,
  listLocalBackup,
  listWebDavBackup,
  restartApp,
  restoreLocalBackup,
  restoreWebDavBackup,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  buildWebdavSignature,
  getWebdavStatus,
  setWebdavStatus,
} from '@/services/webdav-status'

dayjs.extend(customParseFormat)
dayjs.extend(relativeTime)

const DATE_FORMAT = 'YYYY-MM-DD_HH-mm-ss'
const FILENAME_PATTERN = /\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/

type BackupSource = 'local' | 'webdav'
type PendingConfirmation = {
  action: 'delete' | 'restore'
  filename: string
  source: BackupSource
} | null

interface BackupHistoryViewerProps {
  open: boolean
  source: BackupSource
  page: number
  onSourceChange: (source: BackupSource) => void
  onPageChange: (page: number) => void
  onClose: () => void
}

interface BackupRow {
  filename: string
  platform: string
  backup_time: dayjs.Dayjs | null
  display_time: string
  sort_value: number
}

export const BackupHistoryViewer = ({
  open,
  source,
  page,
  onSourceChange,
  onPageChange,
  onClose,
}: BackupHistoryViewerProps) => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const [rows, setRows] = useState<BackupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation>(null)
  const isLocal = source === 'local'
  const isWebDavConfigured = Boolean(
    verge?.webdav_url && verge?.webdav_username && verge?.webdav_password,
  )
  const webdavSignature = buildWebdavSignature(verge)
  const webdavStatus = getWebdavStatus(webdavSignature)
  const shouldSkipWebDav = !isLocal && !isWebDavConfigured
  const pageSize = 8
  const isBusy = loading || isRestoring || isRestarting || isConfirming

  const buildRow = useCallback(
    (item: ILocalBackupFile | IWebDavFile): BackupRow | null => {
      const { filename, last_modified } = item
      if (!filename.toLowerCase().endsWith('.zip')) return null

      const platform =
        (filename.includes('-') && filename.split('-')[0]) ||
        t('settings.modals.backup.history.unknownPlatform', {
          defaultValue: 'unknown',
        })
      const match = filename.match(FILENAME_PATTERN)
      const parsedFromName = match ? dayjs(match[0], DATE_FORMAT, true) : null
      const parsedFromModified =
        last_modified && dayjs(last_modified).isValid()
          ? dayjs(last_modified)
          : null
      const backupTime = parsedFromName?.isValid()
        ? parsedFromName
        : parsedFromModified

      return {
        filename,
        platform,
        backup_time: backupTime ?? null,
        display_time:
          backupTime?.format('YYYY-MM-DD HH:mm') ??
          parsedFromModified?.format('YYYY-MM-DD HH:mm') ??
          t('settings.modals.backup.history.unknownTime', {
            defaultValue: 'Unknown time',
          }),
        sort_value:
          backupTime?.valueOf() ??
          parsedFromModified?.valueOf() ??
          Number.NEGATIVE_INFINITY,
      }
    },
    [t],
  )

  const fetchRows = useCallback(
    async (options?: { force?: boolean }) => {
      if (!open) return
      if (shouldSkipWebDav) {
        setRows([])
        return
      }
      if (!isLocal && webdavStatus === 'failed' && !options?.force) {
        setRows([])
        return
      }

      setLoading(true)
      try {
        const list = isLocal
          ? await listLocalBackup()
          : await listWebDavBackup()
        if (!isLocal) {
          setWebdavStatus(webdavSignature, 'ready')
        }
        setRows(
          list
            .map((item) => buildRow(item))
            .filter((item): item is BackupRow => item !== null)
            .sort((a, b) =>
              a.sort_value === b.sort_value
                ? b.filename.localeCompare(a.filename)
                : b.sort_value - a.sort_value,
            ),
        )
      } catch (error) {
        if (!isLocal) {
          setWebdavStatus(webdavSignature, 'failed')
        }
        console.error(error)
        setRows([])
        showNotice.error(error)
      } finally {
        setLoading(false)
      }
    },
    [buildRow, isLocal, open, shouldSkipWebDav, webdavSignature, webdavStatus],
  )

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedRows = rows.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  )

  const summary = useMemo(() => {
    if (shouldSkipWebDav || (!isLocal && webdavStatus === 'failed')) {
      return t('settings.modals.backup.manual.webdav')
    }
    if (!total) return t('settings.modals.backup.history.empty')
    const recent =
      rows[0]?.backup_time?.fromNow() ?? rows[0]?.display_time ?? ''
    return t('settings.modals.backup.history.summary', {
      count: total,
      recent,
    })
  }, [isLocal, rows, shouldSkipWebDav, t, total, webdavStatus])

  const handleDelete = (filename: string) => {
    if (isRestarting) return
    setPendingConfirmation({ action: 'delete', filename, source })
  }

  const handleRestore = (filename: string) => {
    if (isRestoring || isRestarting) return
    setPendingConfirmation({ action: 'restore', filename, source })
  }

  const handleConfirmAction = useLockFn(async () => {
    if (!pendingConfirmation) return
    const { action, filename, source: actionSource } = pendingConfirmation
    const actionIsLocal = actionSource === 'local'
    setIsConfirming(true)
    if (action === 'restore') {
      setIsRestoring(true)
    }
    try {
      if (action === 'delete') {
        if (actionIsLocal) {
          await deleteLocalBackup(filename)
        } else {
          await deleteWebdavBackup(filename)
        }
        setPendingConfirmation(null)
        await fetchRows()
      } else {
        if (actionIsLocal) {
          await restoreLocalBackup(filename)
        } else {
          await restoreWebDavBackup(filename)
        }
        setPendingConfirmation(null)
        showNotice.success('settings.modals.backup.messages.restoreSuccess')
        setIsRestarting(true)
        window.setTimeout(() => {
          void restartApp().catch((err: unknown) => {
            setIsRestarting(false)
            showNotice.error(err)
          })
        }, 1000)
      }
    } catch (error) {
      console.error(error)
      showNotice.error(error)
    } finally {
      setIsConfirming(false)
      setIsRestoring(false)
    }
  })

  const handleExport = useLockFn(async (filename: string) => {
    if (isRestarting) return
    if (!isLocal) return
    const savePath = await save({ defaultPath: filename })
    if (!savePath || Array.isArray(savePath)) return
    try {
      await exportLocalBackup(filename, savePath)
      showNotice.success('settings.modals.backup.messages.localBackupExported')
    } catch (ignoreError: unknown) {
      showNotice.error(
        'settings.modals.backup.messages.localBackupExportFailed',
      )
    }
  })

  const handleRefresh = () => {
    if (isRestarting) return
    void fetchRows({ force: true })
  }

  const closeConfirmDialog = () => {
    if (isConfirming) return
    setPendingConfirmation(null)
  }

  const confirmTitle =
    pendingConfirmation?.action === 'delete'
      ? t('settings.modals.backup.actions.deleteBackup')
      : t('settings.modals.backup.actions.restoreBackup')
  const confirmMessage =
    pendingConfirmation?.action === 'delete'
      ? t('settings.modals.backup.messages.confirmDelete')
      : t('settings.modals.backup.messages.confirmRestore')

  return (
    <BaseDialog
      open={open}
      title={t('settings.modals.backup.history.title')}
      contentSx={{ width: 520 }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="relative min-h-80">
        <BaseLoadingOverlay isLoading={isBusy} />
        <div className="flex flex-col gap-inset">
          <div className="flex items-center justify-between">
            <Tabs
              value={source}
              onValueChange={(val) => {
                if (isBusy) return
                onSourceChange(val as BackupSource)
                onPageChange(0)
              }}
            >
              <TabsList>
                <TabsTrigger value="local" disabled={isBusy}>
                  {t('settings.modals.backup.tabs.local')}
                </TabsTrigger>
                <TabsTrigger value="webdav" disabled={isBusy}>
                  {t('settings.modals.backup.tabs.webdav')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={isBusy}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {summary}
          </p>

          <div>
            <div className="py-compact text-xs uppercase text-[var(--color-text-muted)]">
              {t('settings.modals.backup.history.title')}
            </div>
            {pagedRows.length === 0 ? (
              <div className="py-component">
                <p className="text-sm text-[var(--color-text-primary)]">
                  {t('settings.modals.backup.history.empty') || ''}
                </p>
              </div>
            ) : (
              pagedRows.map((row) => (
                <div
                  key={`${row.platform}-${row.filename}`}
                  className="border-b border-[var(--color-border)] py-component"
                >
                  <p className="text-sm font-medium break-all text-[var(--color-text-primary)]">
                    {row.filename}
                  </p>
                  <div className="mt-inline flex items-center justify-between gap-stack">
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {`${row.platform} · ${row.display_time}`}
                    </span>
                    <div className="flex items-center gap-inline">
                      {isLocal && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={isBusy}
                          onClick={() => handleExport(row.filename)}
                        >
                          <Download className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={isBusy}
                        onClick={() => handleDelete(row.filename)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={isBusy}
                        onClick={() => handleRestore(row.filename)}
                      >
                        <History className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-end gap-stack">
              <span className="text-xs text-[var(--color-text-secondary)]">
                {currentPage + 1} / {pageCount}
              </span>
              <div className="flex gap-stack">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isBusy || currentPage === 0}
                  onClick={() => onPageChange(Math.max(0, currentPage - 1))}
                >
                  {t('shared.actions.previous')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isBusy || currentPage >= pageCount - 1}
                  onClick={() =>
                    onPageChange(Math.min(pageCount - 1, currentPage + 1))
                  }
                >
                  {t('shared.actions.next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <BaseDialog
        open={pendingConfirmation !== null}
        title={confirmTitle}
        okBtn={t('shared.actions.confirm')}
        cancelBtn={t('shared.actions.cancel')}
        contentSx={{ width: { xs: 320, sm: 420 } }}
        loading={isConfirming}
        onCancel={closeConfirmDialog}
        onClose={closeConfirmDialog}
        onOk={handleConfirmAction}
      >
        <p className="text-sm break-words text-[var(--color-text-primary)]">
          {confirmMessage}
        </p>
        {pendingConfirmation?.filename && (
          <span className="mt-stack block text-xs break-all text-[var(--color-text-secondary)]">
            {pendingConfirmation.filename}
          </span>
        )}
      </BaseDialog>
    </BaseDialog>
  )
}
