import { useLockFn } from 'ahooks'
import { ArrowBigUpDash, Loader2, RotateCcw } from 'lucide-react'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections, upgradeCore } from 'tauri-plugin-mihomo-api'

import { BaseDialog, DialogRef } from '@/components/base'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useClash, useClashInfo } from '@/hooks/use-clash'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import { changeClashCore, restartCore } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

const VALID_CORE = [
  {
    name: 'Mihomo',
    core: 'verge-mihomo',
    chipKey: 'settings.modals.clashCore.variants.release',
  },
  {
    name: 'Mihomo Alpha',
    core: 'verge-mihomo-alpha',
    chipKey: 'settings.modals.clashCore.variants.alpha',
  },
]

export function ClashCoreViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()

  const { verge, mutateVerge } = useVerge()
  const { mutateVersion } = useClash()
  const { invalidateClashConfig } = useClashInfo()

  const [open, setOpen] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [changingCore, setChangingCore] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const { clash_core = 'verge-mihomo' } = verge ?? {}

  const onCoreChange = useLockFn(async (core: string) => {
    if (core === clash_core) return

    try {
      setChangingCore(core)
      closeAllConnections()
      const errorMsg = await changeClashCore(core)

      if (errorMsg) {
        showNotice.error(errorMsg)
        setChangingCore(null)
        return
      }

      mutateVerge()
      await new Promise((resolve) => setTimeout(resolve, 500))
      invalidateClashConfig()
      mutateVersion()
    } catch (err) {
      showNotice.error(err)
    } finally {
      setChangingCore(null)
    }
  })

  const onRestart = useLockFn(async () => {
    try {
      setRestarting(true)
      await restartCore()
      showNotice.success(
        t('settings.feedback.notifications.clash.restartSuccess'),
      )
      setRestarting(false)
    } catch (err) {
      setRestarting(false)
      showNotice.error(err)
    }
  })

  const onUpgrade = useLockFn(async () => {
    try {
      setUpgrading(true)
      await upgradeCore()
      setUpgrading(false)
      mutateVersion()
      showNotice.success(
        t('settings.feedback.notifications.clash.versionUpdated'),
      )
    } catch (err: any) {
      setUpgrading(false)
      const errMsg = err?.response?.data?.message ?? String(err)
      const showMsg = errMsg.includes('already using latest version')
        ? t('settings.feedback.notifications.clash.alreadyLatestVersion')
        : errMsg
      showNotice.info(showMsg)
    }
  })

  return (
    <BaseDialog
      open={open}
      title={
        <div className="flex items-center justify-between">
          {t('settings.sections.clash.form.fields.clashCore')}
          <div className="flex items-center">
            <Button
              size="sm"
              className="mr-component"
              disabled={upgrading || restarting || changingCore !== null}
              onClick={onUpgrade}
            >
              {upgrading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowBigUpDash />
              )}
              {t('shared.actions.upgrade')}
            </Button>
            <Button
              size="sm"
              disabled={restarting || upgrading}
              onClick={onRestart}
            >
              {restarting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RotateCcw />
              )}
              {t('shared.actions.restart')}
            </Button>
          </div>
        </div>
      }
      contentSx={{
        pb: 0,
        width: 400,
        height: 180,
        overflowY: 'auto',
        userSelect: 'text',
        marginTop: '-8px',
      }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    >
      <nav className="flex flex-col gap-inline">
        {VALID_CORE.map((each) => (
          <button
            key={each.core}
            type="button"
            onClick={() => onCoreChange(each.core)}
            disabled={changingCore !== null || restarting || upgrading}
            className={cn(
              'flex w-full items-center justify-between rounded-[var(--radius-control)] px-inset py-component text-left transition-colors hover:bg-[var(--color-bg-hover)] disabled:pointer-events-none disabled:opacity-50',
              each.core === clash_core && 'bg-[var(--color-bg-active)]',
            )}
          >
            <div>
              <p className="text-sm text-[var(--color-text-primary)]">
                {each.name}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                /{each.core}
              </p>
            </div>
            {changingCore === each.core ? (
              <Loader2 className="mr-component size-5 animate-spin" />
            ) : (
              <Badge variant="secondary">{t(each.chipKey)}</Badge>
            )}
          </button>
        ))}
      </nav>
    </BaseDialog>
  )
}
