import { useLockFn } from 'ahooks'
import type { ReactNode } from 'react'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef, Switch, TooltipIcon } from '@/components/base'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import { showNotice } from '@/services/notice-service'

const AdornedInput = ({
  endText,
  wrapperClassName,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  endText?: ReactNode
  wrapperClassName?: string
}) => (
  <div className={cn('relative', wrapperClassName)}>
    <Input {...props} className={cn('pr-14', className)} />
    {endText != null && (
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body text-[var(--color-text-secondary)]">
        {endText}
      </span>
    )}
  </div>
)

export const MiscViewer = forwardRef<DialogRef>((props, ref) => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()

  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({
    appLogLevel: 'warn',
    appLogMaxSize: 8,
    appLogMaxCount: 12,
    autoCloseConnection: true,
    autoCheckUpdate: true,
    enableBuiltinEnhanced: true,
    proxyLayoutColumn: 6,
    enableAutoDelayDetection: false,
    autoDelayDetectionIntervalMinutes: 5,
    defaultLatencyTest: '',
    autoLogClean: 2,
    defaultLatencyTimeout: 10000,
  })

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true)
      setValues({
        appLogLevel: verge?.app_log_level ?? 'warn',
        appLogMaxSize: verge?.app_log_max_size ?? 128,
        appLogMaxCount: verge?.app_log_max_count ?? 8,
        autoCloseConnection: verge?.auto_close_connection ?? true,
        autoCheckUpdate: verge?.auto_check_update ?? true,
        enableBuiltinEnhanced: verge?.enable_builtin_enhanced ?? true,
        proxyLayoutColumn: verge?.proxy_layout_column || 6,
        enableAutoDelayDetection: verge?.enable_auto_delay_detection ?? false,
        autoDelayDetectionIntervalMinutes:
          verge?.auto_delay_detection_interval_minutes ?? 5,
        defaultLatencyTest: verge?.default_latency_test || '',
        autoLogClean: verge?.auto_log_clean || 0,
        defaultLatencyTimeout: verge?.default_latency_timeout || 10000,
      })
    },
    close: () => setOpen(false),
  }))

  const onSave = useLockFn(async () => {
    try {
      await patchVerge({
        app_log_level: values.appLogLevel,
        app_log_max_size: values.appLogMaxSize,
        app_log_max_count: values.appLogMaxCount,
        auto_close_connection: values.autoCloseConnection,
        auto_check_update: values.autoCheckUpdate,
        enable_builtin_enhanced: values.enableBuiltinEnhanced,
        proxy_layout_column: values.proxyLayoutColumn,
        enable_auto_delay_detection: values.enableAutoDelayDetection,
        auto_delay_detection_interval_minutes:
          values.autoDelayDetectionIntervalMinutes,
        default_latency_test: values.defaultLatencyTest,
        default_latency_timeout: values.defaultLatencyTimeout,
        auto_log_clean: values.autoLogClean as any,
      })
      setOpen(false)
    } catch (err) {
      showNotice.error(err)
    }
  })

  return (
    <BaseDialog
      open={open}
      title={t('settings.modals.misc.title')}
      contentSx={{ width: 450 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      <ul className="py-component">
        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.misc.fields.appLogLevel')}</span>
          <Select
            value={values.appLogLevel}
            onValueChange={(value) =>
              setValues((v) => ({ ...v, appLogLevel: value }))
            }
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['trace', 'debug', 'info', 'warn', 'error', 'silent'].map(
                (i) => (
                  <SelectItem value={i} key={i}>
                    {i[0].toUpperCase() + i.slice(1).toLowerCase()}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.misc.fields.appLogMaxSize')}</span>
          <AdornedInput
            autoComplete="new-password"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            wrapperClassName="w-[140px]"
            endText={t('shared.units.kilobytes')}
            value={values.appLogMaxSize}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                appLogMaxSize: Math.max(1, parseInt(e.target.value) || 128),
              }))
            }
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.misc.fields.appLogMaxCount')}</span>
          <AdornedInput
            autoComplete="new-password"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            wrapperClassName="w-[140px]"
            endText={t('shared.units.files')}
            value={values.appLogMaxCount}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                appLogMaxCount: Math.max(1, parseInt(e.target.value) || 1),
              }))
            }
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <div className="flex items-center gap-inline">
            <span>{t('settings.modals.misc.fields.autoCloseConnections')}</span>
            <TooltipIcon
              title={t('settings.modals.misc.tooltips.autoCloseConnections')}
              className="opacity-70"
            />
          </div>
          <Switch
            checked={values.autoCloseConnection}
            onCheckedChange={(c) =>
              setValues((v) => ({ ...v, autoCloseConnection: c }))
            }
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.misc.fields.autoCheckUpdate')}</span>
          <Switch
            checked={values.autoCheckUpdate}
            onCheckedChange={(c) =>
              setValues((v) => ({ ...v, autoCheckUpdate: c }))
            }
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <div className="flex items-center gap-inline">
            <span>
              {t('settings.modals.misc.fields.enableBuiltinEnhanced')}
            </span>
            <TooltipIcon
              title={t('settings.modals.misc.tooltips.enableBuiltinEnhanced')}
              className="opacity-70"
            />
          </div>
          <Switch
            checked={values.enableBuiltinEnhanced}
            onCheckedChange={(c) =>
              setValues((v) => ({ ...v, enableBuiltinEnhanced: c }))
            }
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.misc.fields.proxyLayoutColumns')}</span>
          <Select
            value={String(values.proxyLayoutColumn)}
            onValueChange={(value) =>
              setValues((v) => ({ ...v, proxyLayoutColumn: Number(value) }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6" key={6}>
                {t('settings.modals.misc.options.proxyLayoutColumns.auto')}
              </SelectItem>
              {[1, 2, 3, 4, 5].map((i) => (
                <SelectItem value={String(i)} key={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.misc.fields.autoLogClean')}</span>
          <Select
            value={String(values.autoLogClean)}
            onValueChange={(value) =>
              setValues((v) => ({ ...v, autoLogClean: Number(value) }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* 1: 1天, 2: 7天, 3: 30天, 4: 90天*/}
              {[
                {
                  key: t('settings.modals.misc.options.autoLogClean.never'),
                  value: 0,
                },
                {
                  key: t(
                    'settings.modals.misc.options.autoLogClean.retainDays',
                    {
                      n: 1,
                    },
                  ),
                  value: 1,
                },
                {
                  key: t(
                    'settings.modals.misc.options.autoLogClean.retainDays',
                    {
                      n: 7,
                    },
                  ),
                  value: 2,
                },
                {
                  key: t(
                    'settings.modals.misc.options.autoLogClean.retainDays',
                    {
                      n: 30,
                    },
                  ),
                  value: 3,
                },
                {
                  key: t(
                    'settings.modals.misc.options.autoLogClean.retainDays',
                    {
                      n: 90,
                    },
                  ),
                  value: 4,
                },
              ].map((i) => (
                <SelectItem key={i.value} value={String(i.value)}>
                  {i.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <div className="flex items-center gap-inline">
            <span>{t('settings.modals.misc.fields.autoDelayDetection')}</span>
            <TooltipIcon
              title={t('settings.modals.misc.tooltips.autoDelayDetection')}
              className="opacity-70"
            />
          </div>
          <Switch
            checked={values.enableAutoDelayDetection}
            onCheckedChange={(c) =>
              setValues((v) => ({ ...v, enableAutoDelayDetection: c }))
            }
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>
            {t('settings.modals.misc.fields.autoDelayDetectionInterval')}
          </span>
          <AdornedInput
            autoComplete="new-password"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            wrapperClassName="w-[160px]"
            endText={t('shared.units.minutes')}
            value={values.autoDelayDetectionIntervalMinutes}
            disabled={!values.enableAutoDelayDetection}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10)
              const intervalMinutes =
                Number.isFinite(parsed) && parsed > 0 ? parsed : 1
              setValues((v) => ({
                ...v,
                autoDelayDetectionIntervalMinutes: intervalMinutes,
              }))
            }}
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <div className="flex items-center gap-inline">
            <span>{t('settings.modals.misc.fields.defaultLatencyTest')}</span>
            <TooltipIcon
              title={t('settings.modals.misc.tooltips.defaultLatencyTest')}
              className="opacity-70"
            />
          </div>
          <Input
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-[250px]"
            value={values.defaultLatencyTest}
            placeholder="http://cp.cloudflare.com/generate_204"
            onChange={(e) =>
              setValues((v) => ({ ...v, defaultLatencyTest: e.target.value }))
            }
          />
        </li>

        <li className="flex items-center justify-between gap-component px-adjust py-[5px]">
          <span>{t('settings.modals.misc.fields.defaultLatencyTimeout')}</span>
          <AdornedInput
            autoComplete="new-password"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            wrapperClassName="w-[250px]"
            endText={t('shared.units.milliseconds')}
            value={values.defaultLatencyTimeout}
            placeholder="10000"
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                defaultLatencyTimeout: parseInt(e.target.value),
              }))
            }
          />
        </li>
      </ul>
    </BaseDialog>
  )
})
