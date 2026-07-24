import { useLockFn } from 'ahooks'
import {
  CirclePause,
  CirclePlay,
  Settings,
  Trash2,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DialogRef, Switch, TooltipIcon } from '@/components/base'
import { SysproxyViewer } from '@/components/setting/mods/sysproxy-viewer'
import { TunViewer } from '@/components/setting/mods/tun-viewer'
import { useServiceInstaller } from '@/hooks/use-service-installer'
import { useServiceUninstaller } from '@/hooks/use-service-uninstaller'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useSystemState } from '@/hooks/use-system-state'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import { showNotice } from '@/services/notice-service'

interface ProxySwitchProps {
  label?: string
  onError?: (err: Error) => void
  noRightPadding?: boolean
}

interface SwitchRowProps {
  label: string
  active: boolean
  disabled?: boolean
  infoTitle: string
  onInfoClick?: () => void
  extraIcons?: React.ReactNode
  onToggle: (value: boolean) => Promise<void>
  onError?: (err: Error) => void
  highlight?: boolean
}

/**
 * 抽取的子组件：统一的开关 UI
 * active = 真实状态OS/配置 乐观更新
 */
const SwitchRow = ({
  label,
  active,
  disabled,
  infoTitle,
  onInfoClick,
  extraIcons,
  onToggle,
  onError,
  highlight,
}: SwitchRowProps) => {
  const [checked, setChecked] = useState(active)
  const pendingRef = useRef(false)

  if (pendingRef.current) {
    if (active === checked) pendingRef.current = false
  } else if (checked !== active) {
    setChecked(active)
  }

  const handleChange = (value: boolean) => {
    pendingRef.current = true
    setChecked(value)
    onToggle(value)
      .catch((err: any) => {
        setChecked(active)
        onError?.(err)
      })
      .finally(() => {
        pendingRef.current = false
      })
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-[var(--radius-control)] p-component pr-inset transition-colors duration-[var(--duration-slow)]',
        highlight &&
          'bg-[color-mix(in_srgb,var(--color-success)_7%,transparent)]',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-center">
        {active ? (
          <CirclePlay className="mr-component size-6 text-[var(--color-success)]" />
        ) : (
          <CirclePause className="mr-component size-6 text-[var(--color-text-disabled)]" />
        )}
        <span className="text-[0.9375rem] font-medium">{label}</span>
        <TooltipIcon
          title={infoTitle}
          icon={Settings}
          onClick={onInfoClick}
          className="ml-component"
        />
        {extraIcons}
      </div>

      <Switch
        disabled={disabled}
        checked={checked}
        onCheckedChange={handleChange}
      />
    </div>
  )
}

const ProxyControlSwitches = ({
  label,
  onError,
  noRightPadding = false,
}: ProxySwitchProps) => {
  const { t } = useTranslation()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const { installServiceAndRestartCore } = useServiceInstaller()
  const { uninstallServiceAndRestartCore } = useServiceUninstaller()
  const { indicator: systemProxyIndicator, toggleSystemProxy } =
    useSystemProxyState()
  const { isServiceOk, isTunModeAvailable, mutateSystemState } =
    useSystemState()

  const sysproxyRef = useRef<DialogRef>(null)
  const tunRef = useRef<DialogRef>(null)

  const { enable_tun_mode } = verge ?? {}

  const showErrorNotice = useCallback(
    (msg: string) => showNotice.error(msg),
    [],
  )

  const handleTunToggle = async (value: boolean) => {
    if (!isTunModeAvailable) {
      const msgKey = 'settings.sections.proxyControl.tooltips.tunUnavailable'
      showErrorNotice(msgKey)
      throw new Error(t(msgKey))
    }
    mutateVerge({ ...verge, enable_tun_mode: value }, false)
    await patchVerge({ enable_tun_mode: value })
  }

  const onInstallService = useLockFn(async () => {
    try {
      await installServiceAndRestartCore()
      await mutateSystemState()
    } catch (err) {
      showNotice.error(err)
    }
  })

  const onUninstallService = useLockFn(async () => {
    try {
      if (verge?.enable_tun_mode) {
        await handleTunToggle(false)
      }
      await uninstallServiceAndRestartCore()
      await mutateSystemState()
    } catch (err) {
      showNotice.error(err)
    }
  })

  const isSystemProxyMode =
    label === t('settings.sections.system.toggles.systemProxy') || !label
  const isTunMode = label === t('settings.sections.system.toggles.tunMode')

  return (
    <div className={cn('w-full', noRightPadding ? 'pr-component' : 'pr-inset')}>
      {isSystemProxyMode && (
        <SwitchRow
          label={t('settings.sections.proxyControl.fields.systemProxy')}
          active={systemProxyIndicator}
          infoTitle={t('settings.sections.proxyControl.tooltips.systemProxy')}
          onInfoClick={() => sysproxyRef.current?.open()}
          onToggle={(value) => toggleSystemProxy(value)}
          onError={onError}
          highlight={systemProxyIndicator}
        />
      )}

      {isTunMode && (
        <SwitchRow
          label={t('settings.sections.proxyControl.fields.tunMode')}
          active={enable_tun_mode || false}
          infoTitle={t('settings.sections.proxyControl.tooltips.tunMode')}
          onInfoClick={() => tunRef.current?.open()}
          onToggle={handleTunToggle}
          onError={onError}
          disabled={!isTunModeAvailable}
          highlight={enable_tun_mode || false}
          extraIcons={
            <>
              {!isTunModeAvailable && (
                <>
                  <TooltipIcon
                    title={t(
                      'settings.sections.proxyControl.tooltips.tunUnavailable',
                    )}
                    icon={TriangleAlert}
                    className="ml-component text-[var(--color-warning)]"
                  />
                  <TooltipIcon
                    title={t(
                      'settings.sections.proxyControl.actions.installService',
                    )}
                    icon={Wrench}
                    onClick={onInstallService}
                    className="ml-component text-[var(--color-accent)]"
                  />
                </>
              )}
              {isServiceOk && (
                <TooltipIcon
                  title={t(
                    'settings.sections.proxyControl.actions.uninstallService',
                  )}
                  icon={Trash2}
                  onClick={onUninstallService}
                  className="ml-component text-[var(--color-secondary)]"
                />
              )}
            </>
          }
        />
      )}

      <SysproxyViewer ref={sysproxyRef} />
      <TunViewer ref={tunRef} />
    </div>
  )
}

export default ProxyControlSwitches
