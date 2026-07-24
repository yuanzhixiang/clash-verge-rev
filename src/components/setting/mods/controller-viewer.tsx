import { useLockFn } from 'ahooks'
import { Copy, Loader2 } from 'lucide-react'
import { useImperativeHandle, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef, Switch, TooltipIcon } from '@/components/base'
import { Input } from '@/components/ui/input'
import { useClashInfo } from '@/hooks/use-clash'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import { showNotice } from '@/services/notice-service'

export function ControllerViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const { clashInfo, patchInfo } = useClashInfo()
  const { verge, patchVerge } = useVerge()
  const [controller, setController] = useState(clashInfo?.server || '')
  const [secret, setSecret] = useState(clashInfo?.secret || '')
  const [enableController, setEnableController] = useState(
    verge?.enable_external_controller ?? false,
  )

  // 对话框打开时初始化配置
  useImperativeHandle(ref, () => ({
    open: async () => {
      setOpen(true)
      setController(clashInfo?.server || '')
      setSecret(clashInfo?.secret || '')
      setEnableController(verge?.enable_external_controller ?? false)
    },
    close: () => setOpen(false),
  }))

  // 保存配置
  const onSave = useLockFn(async () => {
    try {
      setIsSaving(true)

      // 先保存 enable_external_controller 设置
      await patchVerge({ enable_external_controller: enableController })

      // 如果启用了外部控制器，则保存控制器地址和密钥
      if (enableController) {
        if (!controller.trim()) {
          showNotice.error(
            'settings.sections.externalController.messages.addressRequired',
          )
          return
        }

        if (!secret.trim()) {
          showNotice.error(
            'settings.sections.externalController.messages.secretRequired',
          )
          return
        }

        await patchInfo({ 'external-controller': controller, secret })
      } else {
        // 如果禁用了外部控制器，则清空控制器地址
        await patchInfo({ 'external-controller': '' })
      }

      showNotice.success('shared.feedback.notifications.common.saveSuccess')
      setOpen(false)
    } catch (err) {
      showNotice.error(
        'shared.feedback.notifications.common.saveFailed',
        err,
        4000,
      )
    } finally {
      setIsSaving(false)
    }
  })

  // 复制到剪贴板
  const handleCopyToClipboard = useLockFn(
    async (text: string, type: string) => {
      try {
        await navigator.clipboard.writeText(text)
        showNotice.success(
          type === 'controller'
            ? 'settings.sections.externalController.messages.controllerCopied'
            : 'settings.sections.externalController.messages.secretCopied',
        )
      } catch (err) {
        console.warn('[ControllerViewer] copy to clipboard failed:', err)
        showNotice.error(
          'settings.sections.externalController.messages.copyFailed',
        )
      }
    },
  )

  return (
    <BaseDialog
      open={open}
      title={t('settings.sections.externalController.title')}
      contentSx={{ width: 400 }}
      okBtn={
        isSaving ? (
          <span className="flex items-center gap-component">
            <Loader2 className="size-4 animate-spin" />
            {t('shared.statuses.saving')}
          </span>
        ) : (
          t('shared.actions.save')
        )
      }
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      <div>
        <div className="flex items-center justify-between px-adjust py-[5px]">
          <span className="text-[var(--color-text-primary)]">
            {t('settings.sections.externalController.fields.enable')}
          </span>
          <Switch
            checked={enableController}
            onCheckedChange={setEnableController}
            disabled={isSaving}
          />
        </div>

        <div className="flex items-center justify-between px-adjust py-[5px]">
          <span className="text-[var(--color-text-primary)]">
            {t('settings.sections.externalController.fields.address')}
          </span>
          <div className="flex items-center gap-component">
            <Input
              className={cn(
                'w-[175px]',
                enableController
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-50',
              )}
              value={controller}
              placeholder={t(
                'settings.sections.externalController.placeholders.address',
              )}
              onChange={(e) => setController(e.target.value)}
              disabled={isSaving || !enableController}
            />
            <TooltipIcon
              title={t('settings.sections.externalController.tooltips.copy')}
              icon={Copy}
              className="text-[var(--color-accent)]"
              onClick={() => handleCopyToClipboard(controller, 'controller')}
              disabled={isSaving || !enableController}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-adjust py-[5px]">
          <span className="text-[var(--color-text-primary)]">
            {t('settings.sections.externalController.fields.secret')}
          </span>
          <div className="flex items-center gap-component">
            <Input
              className={cn(
                'w-[175px]',
                enableController
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-50',
              )}
              value={secret}
              placeholder={t(
                'settings.sections.externalController.placeholders.secret',
              )}
              onChange={(e) => setSecret(e.target.value)}
              disabled={isSaving || !enableController}
            />
            <TooltipIcon
              title={t('settings.sections.externalController.tooltips.copy')}
              icon={Copy}
              className="text-[var(--color-accent)]"
              onClick={() => handleCopyToClipboard(secret, 'secret')}
              disabled={isSaving || !enableController}
            />
          </div>
        </div>
      </div>
    </BaseDialog>
  )
}
