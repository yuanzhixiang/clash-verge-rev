import { invoke } from '@tauri-apps/api/core'
import { useLockFn } from 'ahooks'
import { Network, Settings } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateGeo, type LogLevel } from 'tauri-plugin-mihomo-api'

import { DialogRef, Switch, TooltipIcon } from '@/components/base'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useClash } from '@/hooks/use-clash'
import { useClashLog } from '@/hooks/use-clash-log'
import { useVerge } from '@/hooks/use-verge'
import { invoke_uwp_tool } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'

import { ClashCoreViewer } from './mods/clash-core-viewer'
import { ClashPortViewer } from './mods/clash-port-viewer'
import { ControllerViewer } from './mods/controller-viewer'
import { DnsViewer } from './mods/dns-viewer'
import { HeaderConfiguration } from './mods/external-controller-cors'
import { GuardState } from './mods/guard-state'
import { NetworkInterfaceViewer } from './mods/network-interface-viewer'
import { SettingItem, SettingList } from './mods/setting-comp'
import { TunnelsViewer } from './mods/tunnels-viewer'
import { WebUIViewer } from './mods/web-ui-viewer'

const isWIN = getSystem() === 'windows'

interface Props {
  onError: (err: Error) => void
}

const SettingClash = ({ onError }: Props) => {
  const { t } = useTranslation()

  const { clash, version, mutateClash, patchClash } = useClash()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const [, setClashLog] = useClashLog()

  const {
    ipv6,
    'allow-lan': allowLan,
    'log-level': logLevel,
    'unified-delay': unifiedDelay,
  } = clash ?? {}

  const { verge_mixed_port, enable_quic_fallback_reject } = verge ?? {}

  // 独立跟踪DNS设置开关状态
  const [dnsSettingsEnabled, setDnsSettingsEnabled] = useState(() => {
    return verge?.enable_dns_settings ?? false
  })

  const webRef = useRef<DialogRef>(null)
  const portRef = useRef<DialogRef>(null)
  const ctrlRef = useRef<DialogRef>(null)
  const coreRef = useRef<DialogRef>(null)
  const networkRef = useRef<DialogRef>(null)
  const dnsRef = useRef<DialogRef>(null)
  const corsRef = useRef<DialogRef>(null)
  const tunnelRef = useRef<DialogRef>(null)

  const onSwitchFormat = (_e: any, value: boolean) => value
  const onChangeData = (patch: Partial<IConfigData>) => {
    mutateClash((old) => ({ ...old!, ...patch }), false)
  }
  const onChangeVerge = (patch: Partial<IVergeConfig>) => {
    mutateVerge({ ...verge, ...patch }, false)
  }
  const onUpdateGeo = async () => {
    try {
      await updateGeo()
      showNotice.success('settings.feedback.notifications.clash.geoDataUpdated')
    } catch (err: any) {
      showNotice.error(err)
    }
  }

  // 实现DNS设置开关处理函数
  const handleDnsToggle = useLockFn(async (enable: boolean) => {
    try {
      setDnsSettingsEnabled(enable)
      await patchVerge({ enable_dns_settings: enable })
      await invoke('apply_dns_config', { apply: enable })
      setTimeout(() => {
        mutateClash()
      }, 500)
    } catch (err: any) {
      setDnsSettingsEnabled(!enable)
      showNotice.error(err)
      await patchVerge({ enable_dns_settings: !enable }).catch(() => {})
      throw err
    }
  })

  return (
    <SettingList title={t('settings.sections.clash.title')}>
      <WebUIViewer ref={webRef} />
      <ClashPortViewer ref={portRef} />
      <ControllerViewer ref={ctrlRef} />
      <ClashCoreViewer ref={coreRef} />
      <NetworkInterfaceViewer ref={networkRef} />
      <DnsViewer ref={dnsRef} />
      <HeaderConfiguration ref={corsRef} />
      <TunnelsViewer ref={tunnelRef} />
      <SettingItem
        label={t('settings.sections.clash.form.fields.allowLan')}
        extra={
          <TooltipIcon
            title={t('settings.sections.clash.form.tooltips.networkInterface')}
            className="text-current"
            icon={Network}
            onClick={() => {
              networkRef.current?.open()
            }}
          />
        }
      >
        <GuardState
          value={allowLan ?? false}
          valueProps="checked"
          onCatch={onError}
          onFormat={onSwitchFormat}
          onChange={(e) => onChangeData({ 'allow-lan': e })}
          onGuard={(e) => patchClash({ 'allow-lan': e })}
        >
          <Switch />
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.sections.clash.form.fields.dnsOverwrite')}
        extra={
          <TooltipIcon icon={Settings} onClick={() => dnsRef.current?.open()} />
        }
      >
        <Switch
          checked={dnsSettingsEnabled}
          onCheckedChange={(checked) => handleDnsToggle(checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.sections.clash.form.fields.quicFallbackReject')}
        extra={
          <TooltipIcon
            title={t(
              'settings.sections.clash.form.tooltips.quicFallbackReject',
            )}
            className="opacity-70"
          />
        }
      >
        <GuardState
          value={enable_quic_fallback_reject ?? false}
          valueProps="checked"
          onCatch={onError}
          onFormat={onSwitchFormat}
          onChange={(e) => onChangeVerge({ enable_quic_fallback_reject: e })}
          onGuard={(e) => patchVerge({ enable_quic_fallback_reject: e })}
        >
          <Switch />
        </GuardState>
      </SettingItem>

      <SettingItem label={t('settings.sections.clash.form.fields.ipv6')}>
        <GuardState
          value={ipv6 ?? false}
          valueProps="checked"
          onCatch={onError}
          onFormat={onSwitchFormat}
          onChange={(e) => onChangeData({ ipv6: e })}
          onGuard={(e) => patchClash({ ipv6: e })}
        >
          <Switch />
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.sections.clash.form.fields.unifiedDelay')}
        extra={
          <TooltipIcon
            title={t('settings.sections.clash.form.tooltips.unifiedDelay')}
            className="opacity-70"
          />
        }
      >
        <GuardState
          value={unifiedDelay ?? false}
          valueProps="checked"
          onCatch={onError}
          onFormat={onSwitchFormat}
          onChange={(e) => onChangeData({ 'unified-delay': e })}
          onGuard={(e) => patchClash({ 'unified-delay': e })}
        >
          <Switch />
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.sections.clash.form.fields.logLevel')}
        extra={
          <TooltipIcon
            title={t('settings.sections.clash.form.tooltips.logLevel')}
            className="opacity-70"
          />
        }
      >
        <GuardState
          value={logLevel === 'warn' ? 'warning' : (logLevel ?? 'info')}
          onChangeProps="onValueChange"
          onCatch={onError}
          onChange={(e) => onChangeData({ 'log-level': e })}
          onGuard={(e) => {
            setClashLog((pre) => ({
              ...pre!,
              logLevel: e.toUpperCase() as LogLevel,
            }))
            return patchClash({ 'log-level': e })
          }}
        >
          <Select>
            <SelectTrigger size="sm" className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debug">
                {t('settings.sections.clash.form.options.logLevel.debug')}
              </SelectItem>
              <SelectItem value="info">
                {t('settings.sections.clash.form.options.logLevel.info')}
              </SelectItem>
              <SelectItem value="warning">
                {t('settings.sections.clash.form.options.logLevel.warning')}
              </SelectItem>
              <SelectItem value="error">
                {t('settings.sections.clash.form.options.logLevel.error')}
              </SelectItem>
              <SelectItem value="silent">
                {t('settings.sections.clash.form.options.logLevel.silent')}
              </SelectItem>
            </SelectContent>
          </Select>
        </GuardState>
      </SettingItem>

      <SettingItem label={t('settings.sections.clash.form.fields.portConfig')}>
        <Input
          autoComplete="new-password"
          readOnly
          value={verge_mixed_port ?? 7897}
          className="h-8 w-[100px] cursor-pointer"
          onClick={(e) => {
            portRef.current?.open()
            ;(e.target as HTMLElement).blur()
          }}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.sections.clash.form.fields.external')}
        extra={
          <TooltipIcon
            title={t('settings.sections.externalCors.tooltips.open')}
            icon={Settings}
            onClick={(e) => {
              e.stopPropagation()
              corsRef.current?.open()
            }}
          />
        }
        onClick={() => {
          ctrlRef.current?.open()
        }}
      />

      <SettingItem
        onClick={() => webRef.current?.open()}
        label={t('settings.sections.clash.form.fields.webUI')}
      />

      <SettingItem
        label={t('settings.sections.clash.form.fields.clashCore')}
        extra={
          <TooltipIcon
            icon={Settings}
            onClick={() => coreRef.current?.open()}
          />
        }
      >
        <span className="pr-component">{version}</span>
      </SettingItem>

      {isWIN && (
        <SettingItem
          onClick={invoke_uwp_tool}
          label={t('settings.sections.clash.form.fields.openUwpTool')}
          extra={
            <TooltipIcon
              title={t('settings.sections.clash.form.tooltips.openUwpTool')}
              className="opacity-70"
            />
          }
        />
      )}

      <SettingItem
        onClick={onUpdateGeo}
        label={t('settings.sections.clash.form.fields.updateGeoData')}
      />

      <SettingItem
        label={t('settings.sections.clash.form.fields.tunnels.title')}
        onClick={() => tunnelRef.current?.open()}
      />
    </SettingList>
  )
}

export default SettingClash
