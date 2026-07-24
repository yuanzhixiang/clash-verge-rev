import { useLockFn } from 'ahooks'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef, Switch, TooltipIcon } from '@/components/base'
import { Input } from '@/components/ui/input'
import { useVerge } from '@/hooks/use-verge'
import { entry_lightweight_mode } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

export function LiteModeViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()

  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({
    autoEnterLiteMode: false,
    autoEnterLiteModeDelay: 10, // 默认10分钟
  })

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true)
      setValues({
        autoEnterLiteMode: verge?.enable_auto_light_weight_mode ?? false,
        autoEnterLiteModeDelay: verge?.auto_light_weight_minutes ?? 10,
      })
    },
    close: () => setOpen(false),
  }))

  const onSave = useLockFn(async () => {
    try {
      await patchVerge({
        enable_auto_light_weight_mode: values.autoEnterLiteMode,
        auto_light_weight_minutes: values.autoEnterLiteModeDelay,
      })
      setOpen(false)
    } catch (err) {
      showNotice.error(err)
    }
  })

  return (
    <BaseDialog
      open={open}
      title={t('settings.modals.liteMode.title')}
      contentSx={{ width: 450 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      <ul className="py-component">
        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.liteMode.actions.enterNow')}</span>
          <button
            type="button"
            className="cursor-pointer text-body font-medium uppercase text-[var(--color-accent)] hover:underline"
            onClick={async () => await entry_lightweight_mode()}
          >
            {t('shared.actions.enable')}
          </button>
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <div className="flex items-center gap-inline">
            <span>{t('settings.modals.liteMode.toggles.autoEnter')}</span>
            <TooltipIcon
              title={t('settings.modals.liteMode.tooltips.autoEnter')}
              className="opacity-70"
            />
          </div>
          <Switch
            checked={values.autoEnterLiteMode}
            onCheckedChange={(c) =>
              setValues((v) => ({ ...v, autoEnterLiteMode: c }))
            }
          />
        </li>

        {values.autoEnterLiteMode && (
          <>
            <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
              <span>{t('settings.modals.liteMode.fields.delay')}</span>
              <div className="relative w-[150px]">
                <Input
                  autoComplete="off"
                  type="number"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="pr-14"
                  value={values.autoEnterLiteModeDelay}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      autoEnterLiteModeDelay: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body text-[var(--color-text-secondary)]">
                  {t('shared.units.minutes')}
                </span>
              </div>
            </li>

            <li className="flex items-center px-adjust py-[5px]">
              <p className="text-body italic text-[var(--color-text-secondary)]">
                {t('settings.modals.liteMode.messages.autoEnterHint', {
                  n: values.autoEnterLiteModeDelay,
                })}
              </p>
            </li>
          </>
        )}
      </ul>
    </BaseDialog>
  )
}
