import { open } from '@tauri-apps/plugin-dialog'
import { Copy } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { DialogRef, TooltipIcon } from '@/components/base'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVerge } from '@/hooks/use-verge'
import { navigationItems } from '@/pages/_navigation-meta'
import { copyClashEnv } from '@/services/cmds'
import { supportedLanguages } from '@/services/i18n'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'

import { BackupViewer } from './mods/backup-viewer'
import { ConfigViewer } from './mods/config-viewer'
import { GuardState } from './mods/guard-state'
import { HotkeyViewer } from './mods/hotkey-viewer'
import { LayoutViewer } from './mods/layout-viewer'
import { MiscViewer } from './mods/misc-viewer'
import { SettingItem, SettingList } from './mods/setting-comp'
import { ThemeModeSwitch } from './mods/theme-mode-switch'
import { ThemeViewer } from './mods/theme-viewer'
import { UpdateViewer } from './mods/update-viewer'

interface Props {
  onError?: (err: Error) => void
}

const OS = getSystem()

const languageOptions = supportedLanguages.map((code) => {
  const labels: { [key: string]: string } = {
    en: 'English',
    ru: 'Русский',
    zh: '中文',
    fa: 'فارسی',
    tt: 'Татар',
    id: 'Bahasa Indonesia',
    ar: 'العربية',
    ko: '한국어',
    tr: 'Türkçe',
    de: 'Deutsch',
    es: 'Español',
    jp: '日本語',
    zhtw: '繁體中文',
  }
  const label = labels[code] || code
  return { code, label }
})

const SettingVergeBasic = ({ onError }: Props) => {
  const { t } = useTranslation()

  const { verge, patchVerge, mutateVerge } = useVerge()
  const {
    theme_mode,
    language,
    tray_event,
    env_type,
    startup_script,
    start_page,
  } = verge ?? {}
  const configRef = useRef<DialogRef>(null)
  const hotkeyRef = useRef<DialogRef>(null)
  const miscRef = useRef<DialogRef>(null)
  const themeRef = useRef<DialogRef>(null)
  const layoutRef = useRef<DialogRef>(null)
  const updateRef = useRef<DialogRef>(null)
  const backupRef = useRef<DialogRef>(null)

  const onChangeData = (patch: any) => {
    mutateVerge({ ...verge, ...patch }, false)
  }

  const onCopyClashEnv = useCallback(async () => {
    await copyClashEnv()
    showNotice.success('shared.feedback.notifications.common.copySuccess', 1000)
  }, [])

  return (
    <SettingList title={t('settings.components.verge.basic.title')}>
      <ThemeViewer ref={themeRef} />
      <ConfigViewer ref={configRef} />
      <HotkeyViewer ref={hotkeyRef} />
      <MiscViewer ref={miscRef} />
      <LayoutViewer ref={layoutRef} />
      <UpdateViewer ref={updateRef} />
      <BackupViewer ref={backupRef} />

      <SettingItem label={t('settings.components.verge.basic.fields.language')}>
        <GuardState
          value={language ?? 'en'}
          onChangeProps="onValueChange"
          onCatch={onError}
          onChange={(e) => onChangeData({ language: e })}
          onGuard={(e) => patchVerge({ language: e })}
        >
          <Select>
            <SelectTrigger size="sm" className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map(({ code, label }) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.components.verge.basic.fields.themeMode')}
      >
        <GuardState
          value={theme_mode}
          onCatch={onError}
          onChange={(e) => onChangeData({ theme_mode: e })}
          onGuard={(e) => patchVerge({ theme_mode: e })}
        >
          <ThemeModeSwitch />
        </GuardState>
      </SettingItem>

      {OS !== 'linux' && (
        <SettingItem
          label={t('settings.components.verge.basic.fields.trayClickEvent')}
        >
          <GuardState
            value={tray_event ?? 'main_window'}
            onChangeProps="onValueChange"
            onCatch={onError}
            onChange={(e) => onChangeData({ tray_event: e })}
            onGuard={(e) => patchVerge({ tray_event: e })}
          >
            <Select>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main_window">
                  {t(
                    'settings.components.verge.basic.trayOptions.showMainWindow',
                  )}
                </SelectItem>
                <SelectItem value="tray_menu">
                  {t(
                    'settings.components.verge.basic.trayOptions.showTrayMenu',
                  )}
                </SelectItem>
                <SelectItem value="system_proxy">
                  {t('settings.sections.system.toggles.systemProxy')}
                </SelectItem>
                <SelectItem value="tun_mode">
                  {t('settings.sections.system.toggles.tunMode')}
                </SelectItem>
                <SelectItem value="disable">
                  {t('settings.components.verge.basic.trayOptions.disable')}
                </SelectItem>
              </SelectContent>
            </Select>
          </GuardState>
        </SettingItem>
      )}

      <SettingItem
        label={t('settings.components.verge.basic.fields.copyEnvType')}
        extra={<TooltipIcon icon={Copy} onClick={onCopyClashEnv} />}
      >
        <GuardState
          value={env_type ?? (OS === 'windows' ? 'powershell' : 'bash')}
          onChangeProps="onValueChange"
          onCatch={onError}
          onChange={(e) => onChangeData({ env_type: e })}
          onGuard={(e) => patchVerge({ env_type: e })}
        >
          <Select>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bash">Bash</SelectItem>
              <SelectItem value="fish">Fish</SelectItem>
              <SelectItem value="nushell">Nushell</SelectItem>
              <SelectItem value="cmd">CMD</SelectItem>
              <SelectItem value="powershell">PowerShell</SelectItem>
            </SelectContent>
          </Select>
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.components.verge.basic.fields.startPage')}
      >
        <GuardState
          value={start_page ?? '/'}
          onChangeProps="onValueChange"
          onCatch={onError}
          onChange={(e) => onChangeData({ start_page: e })}
          onGuard={(e) => patchVerge({ start_page: e })}
        >
          <Select>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(navigationItems).map((page) => {
                return (
                  <SelectItem key={page.path} value={page.path}>
                    {t(page.label)}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </GuardState>
      </SettingItem>

      <SettingItem
        label={t('settings.components.verge.basic.fields.startupScript')}
      >
        <div className="flex w-[230px] items-center gap-inline">
          <GuardState
            value={startup_script ?? ''}
            onCatch={onError}
            onFormat={(e: any) => e.target.value}
            onChange={(e) => onChangeData({ startup_script: e })}
            onGuard={(e) => patchVerge({ startup_script: e })}
          >
            <Input readOnly disabled className="h-8 min-w-0 flex-1" />
          </GuardState>
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={async () => {
              const selected = await open({
                directory: false,
                multiple: false,
                filters: [
                  {
                    name: 'Shell Script',
                    extensions: ['sh', 'bat', 'ps1'],
                  },
                ],
              })
              if (selected) {
                onChangeData({ startup_script: `${selected}` })
                patchVerge({ startup_script: `${selected}` })
              }
            }}
          >
            {t('settings.components.verge.basic.actions.browse')}
          </Button>
          {startup_script && (
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={async () => {
                onChangeData({ startup_script: '' })
                patchVerge({ startup_script: '' })
              }}
            >
              {t('shared.actions.clear')}
            </Button>
          )}
        </div>
      </SettingItem>

      <SettingItem
        onClick={() => themeRef.current?.open()}
        label={t('settings.components.verge.basic.fields.themeSetting')}
      />

      <SettingItem
        onClick={() => layoutRef.current?.open()}
        label={t('settings.components.verge.basic.fields.layoutSetting')}
      />

      <SettingItem
        onClick={() => miscRef.current?.open()}
        label={t('settings.components.verge.basic.fields.misc')}
      />

      <SettingItem
        onClick={() => hotkeyRef.current?.open()}
        label={t('settings.components.verge.basic.fields.hotkeySetting')}
      />
    </SettingList>
  )
}

export default SettingVergeBasic
