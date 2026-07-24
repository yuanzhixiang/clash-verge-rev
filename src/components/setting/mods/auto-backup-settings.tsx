import { useLockFn } from 'ahooks'
import { Fragment, useMemo, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/base'
import { Input } from '@/components/ui/input'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'

const MIN_INTERVAL_HOURS = 1
const MAX_INTERVAL_HOURS = 168

interface AutoBackupState {
  scheduleEnabled: boolean
  intervalHours: number
  changeEnabled: boolean
}

export function AutoBackupSettings() {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const derivedValues = useMemo<AutoBackupState>(() => {
    return {
      scheduleEnabled: verge?.enable_auto_backup_schedule ?? false,
      intervalHours: verge?.auto_backup_interval_hours ?? 24,
      changeEnabled: verge?.auto_backup_on_change ?? true,
    }
  }, [
    verge?.enable_auto_backup_schedule,
    verge?.auto_backup_interval_hours,
    verge?.auto_backup_on_change,
  ])
  const [pendingValues, setPendingValues] = useState<AutoBackupState | null>(
    null,
  )
  const values = useMemo(() => {
    if (!pendingValues) {
      return derivedValues
    }
    if (
      pendingValues.scheduleEnabled === derivedValues.scheduleEnabled &&
      pendingValues.intervalHours === derivedValues.intervalHours &&
      pendingValues.changeEnabled === derivedValues.changeEnabled
    ) {
      return derivedValues
    }
    return pendingValues
  }, [pendingValues, derivedValues])
  const [intervalInputDraft, setIntervalInputDraft] = useState<string | null>(
    null,
  )

  const applyPatch = useLockFn(
    async (
      partial: Partial<AutoBackupState>,
      payload: Partial<IVergeConfig>,
    ) => {
      const nextValues = { ...values, ...partial }
      setPendingValues(nextValues)
      try {
        await patchVerge(payload)
      } catch (error) {
        showNotice.error(error)
        setPendingValues(null)
      }
    },
  )

  const disabled = !verge

  const handleScheduleToggle = (checked: boolean) => {
    applyPatch(
      { scheduleEnabled: checked },
      {
        enable_auto_backup_schedule: checked,
        auto_backup_interval_hours: values.intervalHours,
      },
    )
  }

  const handleChangeToggle = (checked: boolean) => {
    applyPatch({ changeEnabled: checked }, { auto_backup_on_change: checked })
  }

  const handleIntervalInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIntervalInputDraft(event.target.value)
  }

  const commitIntervalInput = () => {
    const rawValue = intervalInputDraft ?? values.intervalHours.toString()
    const trimmed = rawValue.trim()
    if (trimmed === '') {
      setIntervalInputDraft(null)
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setIntervalInputDraft(null)
      return
    }

    const clamped = Math.min(
      MAX_INTERVAL_HOURS,
      Math.max(MIN_INTERVAL_HOURS, Math.round(parsed)),
    )

    if (clamped === values.intervalHours) {
      setIntervalInputDraft(null)
      return
    }

    applyPatch(
      { intervalHours: clamped },
      { auto_backup_interval_hours: clamped },
    )
    setIntervalInputDraft(null)
  }

  const scheduleDisabled = disabled || !values.scheduleEnabled

  return (
    <Fragment>
      <div className="flex items-center gap-component border-b border-[var(--color-border)] py-component">
        <div className="flex-1">
          <p className="text-sm text-[var(--color-text-primary)]">
            {t('settings.modals.backup.auto.scheduleLabel')}
          </p>
          <p className="mt-adjust text-xs text-[var(--color-text-secondary)]">
            {t('settings.modals.backup.auto.scheduleHelper')}
          </p>
        </div>
        <Switch
          checked={values.scheduleEnabled}
          onCheckedChange={handleScheduleToggle}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-inset border-b border-[var(--color-border)] py-component">
        <div className="flex-1">
          <p className="text-sm text-[var(--color-text-primary)]">
            {t('settings.modals.backup.auto.intervalLabel')}
          </p>
        </div>
        <div className="relative min-w-40">
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_INTERVAL_HOURS}
            max={MAX_INTERVAL_HOURS}
            value={intervalInputDraft ?? values.intervalHours.toString()}
            disabled={scheduleDisabled}
            onChange={handleIntervalInputChange}
            onBlur={commitIntervalInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitIntervalInput()
              }
            }}
            className="pr-14"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">
            {t('shared.units.hours')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-component border-b border-[var(--color-border)] py-component">
        <div className="flex-1">
          <p className="text-sm text-[var(--color-text-primary)]">
            {t('settings.modals.backup.auto.changeLabel')}
          </p>
          <p className="mt-adjust text-xs text-[var(--color-text-secondary)]">
            {t('settings.modals.backup.auto.changeHelper')}
          </p>
        </div>
        <Switch
          checked={values.changeEnabled}
          onCheckedChange={handleChangeToggle}
          disabled={disabled}
        />
      </div>
    </Fragment>
  )
}
