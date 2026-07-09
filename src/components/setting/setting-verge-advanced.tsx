import { ContentCopyRounded } from '@mui/icons-material'
import { Typography } from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DialogRef, TooltipIcon } from '@/components/base'
import { updateLastCheckTime } from '@/hooks/use-update'
import {
  exitApp,
  exportDiagnosticInfo,
  getCliInstallStatus,
  installCli,
  openAppDir,
  openCoreDir,
  openDevTools,
  openLogsDir,
  uninstallCli,
} from '@/services/cmds'
import type { CliInstallStatus } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { checkUpdateSafe as checkUpdate } from '@/services/update'
import { version } from '@root/package.json'

import { BackupViewer } from './mods/backup-viewer'
import { ConfigViewer } from './mods/config-viewer'
import { HotkeyViewer } from './mods/hotkey-viewer'
import { LayoutViewer } from './mods/layout-viewer'
import { LiteModeViewer } from './mods/lite-mode-viewer'
import { MiscViewer } from './mods/misc-viewer'
import { SettingItem, SettingList } from './mods/setting-comp'
import { ThemeViewer } from './mods/theme-viewer'
import { UpdateViewer } from './mods/update-viewer'

interface Props {
  onError?: (err: Error) => void
}

const SettingVergeAdvanced = ({ onError: _ }: Props) => {
  const { t } = useTranslation()
  const [cliStatus, setCliStatus] = useState<CliInstallStatus | null>(null)

  const configRef = useRef<DialogRef>(null)
  const hotkeyRef = useRef<DialogRef>(null)
  const miscRef = useRef<DialogRef>(null)
  const themeRef = useRef<DialogRef>(null)
  const layoutRef = useRef<DialogRef>(null)
  const updateRef = useRef<DialogRef>(null)
  const backupRef = useRef<DialogRef>(null)
  const liteModeRef = useRef<DialogRef>(null)

  const onCheckUpdate = async () => {
    try {
      const info = await checkUpdate()
      updateLastCheckTime()
      if (!info?.available) {
        showNotice.success(
          'settings.components.verge.advanced.notifications.latestVersion',
        )
      } else {
        updateRef.current?.open()
      }
    } catch (err: any) {
      showNotice.error(err)
    }
  }

  const onExportDiagnosticInfo = useCallback(async () => {
    await exportDiagnosticInfo()
    showNotice.success('shared.feedback.notifications.common.copySuccess', 1000)
  }, [])

  const refreshCliStatus = useCallback(async () => {
    try {
      setCliStatus(await getCliInstallStatus())
    } catch (err) {
      console.error('Failed to read CLI install status:', err)
    }
  }, [])

  useEffect(() => {
    refreshCliStatus()
  }, [refreshCliStatus])

  const onToggleCli = useCallback(async () => {
    try {
      const shouldUninstall = cliStatus?.installed && cliStatus.versionMatches
      const nextStatus = shouldUninstall ? await uninstallCli() : await installCli()
      setCliStatus(nextStatus)
      showNotice.success(
        nextStatus.installed
          ? 'settings.components.verge.advanced.notifications.cliInstalled'
          : 'settings.components.verge.advanced.notifications.cliUninstalled',
        1000,
      )
    } catch (err: any) {
      showNotice.error(err)
    }
  }, [cliStatus?.installed, cliStatus?.versionMatches])

  const copyVersion = useCallback(() => {
    navigator.clipboard.writeText(`v${version}`).then(() => {
      showNotice.success(
        'settings.components.verge.advanced.notifications.versionCopied',
        1000,
      )
    })
  }, [])

  return (
    <SettingList title={t('settings.components.verge.advanced.title')}>
      <ThemeViewer ref={themeRef} />
      <ConfigViewer ref={configRef} />
      <HotkeyViewer ref={hotkeyRef} />
      <MiscViewer ref={miscRef} />
      <LayoutViewer ref={layoutRef} />
      <UpdateViewer ref={updateRef} />
      <BackupViewer ref={backupRef} />
      <LiteModeViewer ref={liteModeRef} />

      <SettingItem
        onClick={() => backupRef.current?.open()}
        label={t('settings.components.verge.advanced.fields.backupSetting')}
        extra={
          <TooltipIcon
            title={t('settings.components.verge.advanced.tooltips.backupInfo')}
            sx={{ opacity: '0.7' }}
          />
        }
      />

      <SettingItem
        onClick={() => configRef.current?.open()}
        label={t('settings.components.verge.advanced.fields.runtimeConfig')}
      />

      <SettingItem
        onClick={openAppDir}
        label={t('settings.components.verge.advanced.fields.openConfDir')}
        extra={
          <TooltipIcon
            title={t('settings.components.verge.advanced.tooltips.openConfDir')}
            sx={{ opacity: '0.7' }}
          />
        }
      />

      <SettingItem
        onClick={openCoreDir}
        label={t('settings.components.verge.advanced.fields.openCoreDir')}
      />

      <SettingItem
        onClick={openLogsDir}
        label={t('settings.components.verge.advanced.fields.openLogsDir')}
      />

      <SettingItem
        onClick={onToggleCli}
        label={t(
          cliStatus?.installed && cliStatus.versionMatches
            ? 'settings.components.verge.advanced.fields.uninstallCli'
            : 'settings.components.verge.advanced.fields.installCli',
        )}
        secondary={
          cliStatus
            ? `${
                cliStatus.installed
                  ? t('settings.components.verge.advanced.fields.cliInstalledAt')
                  : t('settings.components.verge.advanced.fields.cliInstallDir')
              } ${cliStatus.installed ? cliStatus.path : cliStatus.installDir}`
            : undefined
        }
      />

      <SettingItem
        onClick={onCheckUpdate}
        label={t('settings.components.verge.advanced.fields.checkUpdates')}
      />

      <SettingItem
        onClick={openDevTools}
        label={t('settings.components.verge.advanced.fields.openDevTools')}
      />

      <SettingItem
        label={t('settings.components.verge.advanced.fields.liteModeSettings')}
        extra={
          <TooltipIcon
            title={t('settings.components.verge.advanced.tooltips.liteMode')}
            sx={{ opacity: '0.7' }}
          />
        }
        onClick={() => liteModeRef.current?.open()}
      />

      <SettingItem
        onClick={() => {
          exitApp()
        }}
        label={t('settings.components.verge.advanced.fields.exit')}
      />

      <SettingItem
        label={t('settings.components.verge.advanced.fields.exportDiagnostics')}
        extra={
          <TooltipIcon
            icon={ContentCopyRounded}
            onClick={onExportDiagnosticInfo}
          />
        }
      ></SettingItem>

      <SettingItem
        label={t('settings.components.verge.advanced.fields.vergeVersion')}
        extra={
          <TooltipIcon
            icon={ContentCopyRounded}
            onClick={copyVersion}
            title={t('settings.components.verge.advanced.actions.copyVersion')}
          />
        }
      >
        <Typography sx={{ py: '7px', pr: 1 }}>v{version}</Typography>
      </SettingItem>
    </SettingList>
  )
}

export default SettingVergeAdvanced
