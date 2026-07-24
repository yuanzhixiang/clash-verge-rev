import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import { Loader2 } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { useCallback, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef } from '@/components/base'
import { Button } from '@/components/ui/button'
import { useVerge } from '@/hooks/use-verge'
import {
  createLocalBackup,
  createWebdavBackup,
  importLocalBackup,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { buildWebdavSignature, setWebdavStatus } from '@/services/webdav-status'

import { AutoBackupSettings } from './auto-backup-settings'
import { BackupHistoryViewer } from './backup-history-viewer'
import { BackupWebdavDialog } from './backup-webdav-dialog'

type BackupSource = 'local' | 'webdav'

export function BackupViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const [open, setOpen] = useState(false)
  const [busyAction, setBusyAction] = useState<BackupSource | null>(null)
  const [localImporting, setLocalImporting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySource, setHistorySource] = useState<BackupSource>('local')
  const [historyPage, setHistoryPage] = useState(0)
  const [webdavDialogOpen, setWebdavDialogOpen] = useState(false)
  const webdavSignature = buildWebdavSignature(verge)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const openHistory = (target: BackupSource) => {
    setHistorySource(target)
    setHistoryPage(0)
    setHistoryOpen(true)
  }

  const handleBackup = useLockFn(async (target: BackupSource) => {
    try {
      setBusyAction(target)
      if (target === 'local') {
        await createLocalBackup()
        showNotice.success('settings.modals.backup.messages.localBackupCreated')
      } else {
        await createWebdavBackup()
        showNotice.success('settings.modals.backup.messages.backupCreated')
        setWebdavStatus(webdavSignature, 'ready')
      }
    } catch (error) {
      console.error(error)
      showNotice.error(
        target === 'local'
          ? 'settings.modals.backup.messages.localBackupFailed'
          : 'settings.modals.backup.messages.backupFailed',
        target === 'local' ? undefined : { error },
      )
      if (target === 'webdav') {
        setWebdavStatus(webdavSignature, 'failed')
      }
    } finally {
      setBusyAction(null)
    }
  })

  const handleImport = useLockFn(async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Backup File', extensions: ['zip'] }],
    })
    if (!selected || Array.isArray(selected)) return
    try {
      setLocalImporting(true)
      await importLocalBackup(selected)
      showNotice.success('settings.modals.backup.messages.localBackupImported')
      openHistory('local')
    } catch (error) {
      console.error(error)
      showNotice.error(
        'settings.modals.backup.messages.localBackupImportFailed',
        { error },
      )
    } finally {
      setLocalImporting(false)
    }
  })

  const setWebdavBusy = useCallback(
    (loading: boolean) => {
      setBusyAction(loading ? 'webdav' : null)
    },
    [setBusyAction],
  )

  const isLocalBusy = busyAction === 'local' || localImporting

  return (
    <BaseDialog
      open={open}
      title={t('settings.modals.backup.title')}
      contentSx={{ width: { xs: 360, sm: 520 } }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onCancel={() => setOpen(false)}
      onClose={() => setOpen(false)}
    >
      <div className="flex flex-col gap-inset">
        <div className="flex flex-col gap-stack rounded-[var(--radius-container)] border border-[var(--color-border)] p-inset">
          <p className="font-medium text-[var(--color-text-primary)]">
            {t('settings.modals.backup.auto.title')}
          </p>
          <div>
            <AutoBackupSettings />
          </div>
        </div>

        <div className="flex flex-col gap-stack rounded-[var(--radius-container)] border border-[var(--color-border)] p-inset">
          <p className="font-medium text-[var(--color-text-primary)]">
            {t('settings.modals.backup.manual.title')}
          </p>
          <div>
            {(
              [
                {
                  key: 'local' as BackupSource,
                  title: t('settings.modals.backup.tabs.local'),
                  description: t('settings.modals.backup.manual.local'),
                  actions: [
                    <Button
                      key="backup"
                      size="sm"
                      disabled={busyAction === 'local' || localImporting}
                      onClick={() => handleBackup('local')}
                    >
                      {busyAction === 'local' && (
                        <Loader2 className="animate-spin" />
                      )}
                      {t('settings.modals.backup.actions.backup')}
                    </Button>,
                    <Button
                      key="history"
                      variant="outline"
                      size="sm"
                      disabled={isLocalBusy}
                      onClick={() => openHistory('local')}
                    >
                      {t('settings.modals.backup.actions.viewHistory')}
                    </Button>,
                    <Button
                      key="import"
                      variant="ghost"
                      size="sm"
                      disabled={localImporting || busyAction === 'local'}
                      onClick={() => handleImport()}
                    >
                      {localImporting && <Loader2 className="animate-spin" />}
                      {t('settings.modals.backup.actions.importBackup')}
                    </Button>,
                  ],
                },
                {
                  key: 'webdav' as BackupSource,
                  title: t('settings.modals.backup.tabs.webdav'),
                  description: t('settings.modals.backup.manual.webdav'),
                  actions: [
                    <Button
                      key="backup"
                      size="sm"
                      disabled={busyAction === 'webdav'}
                      onClick={() => handleBackup('webdav')}
                    >
                      {busyAction === 'webdav' && (
                        <Loader2 className="animate-spin" />
                      )}
                      {t('settings.modals.backup.actions.backup')}
                    </Button>,
                    <Button
                      key="history"
                      variant="outline"
                      size="sm"
                      onClick={() => openHistory('webdav')}
                    >
                      {t('settings.modals.backup.actions.viewHistory')}
                    </Button>,
                    <Button
                      key="configure"
                      variant="ghost"
                      size="sm"
                      onClick={() => setWebdavDialogOpen(true)}
                    >
                      {t('settings.modals.backup.manual.configureWebdav')}
                    </Button>,
                  ],
                },
              ] satisfies Array<{
                key: BackupSource
                title: string
                description: string
                actions: ReactNode[]
              }>
            ).map((item, idx) => (
              <div
                key={item.key}
                className={
                  idx === 0
                    ? 'border-b border-[var(--color-border)] py-component'
                    : 'py-component'
                }
              >
                <div className="flex flex-col gap-stack">
                  <div>
                    <p className="text-sm text-[var(--color-text-primary)]">
                      {item.title}
                    </p>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {item.description}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-stack">
                    {item.actions}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BackupHistoryViewer
        open={historyOpen}
        source={historySource}
        page={historyPage}
        onSourceChange={setHistorySource}
        onPageChange={setHistoryPage}
        onClose={() => setHistoryOpen(false)}
      />
      <BackupWebdavDialog
        open={webdavDialogOpen}
        onClose={() => setWebdavDialogOpen(false)}
        onBackupSuccess={() => openHistory('webdav')}
        setBusy={setWebdavBusy}
      />
    </BaseDialog>
  )
}
