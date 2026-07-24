import { useLockFn } from 'ahooks'
import { Info, Puzzle, Server, Settings, ShieldUser } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useServiceInstaller } from '@/hooks/use-service-installer'
import { useSystemState } from '@/hooks/use-system-state'
import {
  useUpdate,
  updateLastCheckTime,
  readLastCheckTime,
} from '@/hooks/use-update'
import { useVerge } from '@/hooks/use-verge'
import { cn } from '@/lib/utils'
import { getSystemInfo } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { version as appVersion } from '@root/package.json'

import { EnhancedCard } from './enhanced-card'

export const SystemInfoCard = () => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const navigate = useNavigate()
  const { isAdminMode, isSidecarMode } = useSystemState()
  const { installServiceAndRestartCore } = useServiceInstaller()

  // 自动检查更新逻辑（lastCheckUpdate 由 useUpdate 统一管理）
  const { checkUpdate: triggerCheckUpdate, lastCheckUpdate } = useUpdate(true)

  const [osInfo, setOsInfo] = useState('')

  const lastCheckUpdateText = useMemo(
    () => (lastCheckUpdate ? new Date(lastCheckUpdate).toLocaleString() : '-'),
    [lastCheckUpdate],
  )

  // 初始化系统信息
  useEffect(() => {
    getSystemInfo()
      .then((info) => {
        const sysName = info.system_name
        let sysVersion = info.system_version

        if (
          sysName &&
          sysVersion.toLowerCase().startsWith(sysName.toLowerCase())
        ) {
          sysVersion = sysVersion.substring(sysName.length).trim()
        }

        setOsInfo(`${sysName} ${sysVersion}`)
      })
      .catch(console.error)
  }, [])

  // 如果启用了自动检查更新但没有记录，设置当前时间并延迟检查
  useEffect(() => {
    if (!verge?.auto_check_update) return
    if (readLastCheckTime() !== null) return

    updateLastCheckTime()
    const timeoutId = window.setTimeout(() => {
      triggerCheckUpdate().catch(console.error)
    }, 5000)
    return () => window.clearTimeout(timeoutId)
  }, [verge?.auto_check_update, triggerCheckUpdate])

  // 导航到设置页面
  const goToSettings = useCallback(() => {
    navigate('/settings')
  }, [navigate])

  // 切换自启动状态
  const toggleAutoLaunch = useCallback(async () => {
    if (!verge) return
    try {
      await patchVerge({ enable_auto_launch: !verge.enable_auto_launch })
    } catch (err) {
      console.error('切换开机自启动状态失败:', err)
    }
  }, [verge, patchVerge])

  // 点击运行模式处理,Sidecar或纯管理员模式允许安装服务
  const handleRunningModeClick = useCallback(() => {
    if (isSidecarMode || (isAdminMode && isSidecarMode)) {
      installServiceAndRestartCore()
    }
  }, [isSidecarMode, isAdminMode, installServiceAndRestartCore])

  // 检查更新
  const onCheckUpdate = useLockFn(async () => {
    try {
      const result = await triggerCheckUpdate()
      const info = result.data
      if (!info?.available) {
        showNotice.success(
          'settings.components.verge.advanced.notifications.latestVersion',
        )
      } else {
        showNotice.info('shared.feedback.notifications.updateAvailable', 2000)
        goToSettings()
      }
    } catch (err) {
      showNotice.error(err)
    }
  })

  // 是否启用自启动
  const autoLaunchEnabled = useMemo(
    () => verge?.enable_auto_launch || false,
    [verge],
  )

  // Sidecar或纯管理员模式允许安装服务
  const runningModeClickable = isSidecarMode || (isAdminMode && isSidecarMode)

  // 获取模式图标和文本
  const getModeIcon = () => {
    if (isAdminMode) {
      // 判断是否为组合模式（管理员+服务）
      if (!isSidecarMode) {
        return (
          <>
            <ShieldUser
              className="size-4 text-[var(--color-accent)]"
              aria-label={t('home.components.systemInfo.badges.adminMode')}
            />
            <Server
              className="ml-inline size-4 text-[var(--color-success)]"
              aria-label={t('home.components.systemInfo.badges.serviceMode')}
            />
          </>
        )
      }
      return (
        <ShieldUser
          className="size-4 text-[var(--color-accent)]"
          aria-label={t('home.components.systemInfo.badges.adminMode')}
        />
      )
    } else if (isSidecarMode) {
      return (
        <Puzzle
          className="size-4 text-[var(--color-info)]"
          aria-label={t('home.components.systemInfo.badges.sidecarMode')}
        />
      )
    } else {
      return (
        <Server
          className="size-4 text-[var(--color-success)]"
          aria-label={t('home.components.systemInfo.badges.serviceMode')}
        />
      )
    }
  }

  // 获取模式文本
  const getModeText = () => {
    if (isAdminMode) {
      // 判断是否同时处于服务模式
      if (!isSidecarMode) {
        return t('home.components.systemInfo.badges.adminServiceMode')
      }
      return t('home.components.systemInfo.badges.adminMode')
    } else if (isSidecarMode) {
      return t('home.components.systemInfo.badges.sidecarMode')
    } else {
      return t('home.components.systemInfo.badges.serviceMode')
    }
  }

  // 只有当verge存在时才渲染内容
  if (!verge) return null

  return (
    <EnhancedCard
      title={t('home.components.systemInfo.title')}
      icon={<Info className="size-5" />}
      iconColor="error"
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={goToSettings}
          title={t('home.components.systemInfo.actions.settings')}
        >
          <Settings className="size-4" />
        </Button>
      }
    >
      <div className="flex flex-col gap-stack">
        <div className="flex justify-between">
          <span className="text-body text-[var(--color-text-secondary)]">
            {t('home.components.systemInfo.fields.osInfo')}
          </span>
          <span className="text-body font-medium">{osInfo}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-body text-[var(--color-text-secondary)]">
            {t('home.components.systemInfo.fields.autoLaunch')}
          </span>
          <div className="flex items-center gap-component">
            <Badge
              onClick={toggleAutoLaunch}
              variant={autoLaunchEnabled ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer',
                autoLaunchEnabled &&
                  'border-transparent bg-[var(--color-success)] text-[var(--color-text-on-accent)]',
              )}
            >
              {autoLaunchEnabled
                ? t('shared.statuses.enabled')
                : t('shared.statuses.disabled')}
            </Badge>
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-body text-[var(--color-text-secondary)]">
            {t('home.components.systemInfo.fields.runningMode')}
          </span>
          <span
            onClick={handleRunningModeClick}
            className={cn(
              'flex items-center gap-inline text-body font-medium',
              runningModeClickable
                ? 'cursor-pointer underline hover:opacity-70'
                : 'cursor-default',
            )}
          >
            {getModeIcon()}
            {getModeText()}
          </span>
        </div>
        <Separator />
        <div className="flex justify-between">
          <span className="text-body text-[var(--color-text-secondary)]">
            {t('home.components.systemInfo.fields.lastCheckUpdate')}
          </span>
          <span
            onClick={onCheckUpdate}
            className="cursor-pointer text-body font-medium underline hover:opacity-70"
          >
            {lastCheckUpdateText}
          </span>
        </div>
        <Separator />
        <div className="flex justify-between">
          <span className="text-body text-[var(--color-text-secondary)]">
            {t('home.components.systemInfo.fields.vergeVersion')}
          </span>
          <span className="text-body font-medium">v{appVersion}</span>
        </div>
      </div>
    </EnhancedCard>
  )
}
