import { useLockFn, useRequest } from 'ahooks'
import { Loader2, Shuffle } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, Switch } from '@/components/base'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClashInfo } from '@/hooks/use-clash'
import { useVerge } from '@/hooks/use-verge'
import { isPortInUse } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'

const OS = getSystem()

interface ClashPortViewerRef {
  open: () => void
  close: () => void
}

const generateRandomPort = () =>
  Math.floor(Math.random() * (65535 - 1025 + 1)) + 1025

export const ClashPortViewer = forwardRef<ClashPortViewerRef>((_, ref) => {
  const { t } = useTranslation()
  const { clashInfo, patchInfo } = useClashInfo()
  const { verge, patchVerge } = useVerge()
  const [open, setOpen] = useState(false)

  // Mixed Port
  const [mixedPort, setMixedPort] = useState(
    verge?.verge_mixed_port ?? clashInfo?.mixed_port ?? 7897,
  )

  // 其他端口状态
  const [socksPort, setSocksPort] = useState(verge?.verge_socks_port ?? 7898)
  const [socksEnabled, setSocksEnabled] = useState(
    verge?.verge_socks_enabled ?? false,
  )
  const [httpPort, setHttpPort] = useState(verge?.verge_port ?? 7899)
  const [httpEnabled, setHttpEnabled] = useState(
    verge?.verge_http_enabled ?? false,
  )
  const [redirPort, setRedirPort] = useState(verge?.verge_redir_port ?? 7895)
  const [redirEnabled, setRedirEnabled] = useState(
    verge?.verge_redir_enabled ?? false,
  )
  const [tproxyPort, setTproxyPort] = useState(verge?.verge_tproxy_port ?? 7896)
  const [tproxyEnabled, setTproxyEnabled] = useState(
    verge?.verge_tproxy_enabled ?? false,
  )

  // 保存打开对话框时的原始值，用于在检测到端口被占用时恢复
  const originalPortsRef = useRef<Record<string, any> | null>(null)

  // 添加保存请求，防止GUI卡死
  const { loading, run: saveSettings } = useRequest(
    async (params: { clashConfig: any; vergeConfig: any }) => {
      const { clashConfig, vergeConfig } = params
      await Promise.all([patchInfo(clashConfig), patchVerge(vergeConfig)])
    },
    {
      manual: true,
      onSuccess: () => {
        setOpen(false)
        showNotice.success('settings.modals.clashPort.messages.saved')
      },
      onError: (error) => {
        showNotice.error('settings.modals.clashPort.messages.saveFailed', error)
      },
    },
  )

  useImperativeHandle(ref, () => ({
    open: () => {
      originalPortsRef.current = {
        mixedPort: verge?.verge_mixed_port ?? clashInfo?.mixed_port ?? 7897,
        socksPort: verge?.verge_socks_port ?? 7898,
        socksEnabled: verge?.verge_socks_enabled ?? false,
        httpPort: verge?.verge_port ?? 7899,
        httpEnabled: verge?.verge_http_enabled ?? false,
        redirPort: verge?.verge_redir_port ?? 7895,
        redirEnabled: verge?.verge_redir_enabled ?? false,
        tproxyPort: verge?.verge_tproxy_port ?? 7896,
        tproxyEnabled: verge?.verge_tproxy_enabled ?? false,
      }

      setMixedPort(originalPortsRef.current.mixedPort)
      setSocksPort(originalPortsRef.current.socksPort)
      setSocksEnabled(originalPortsRef.current.socksEnabled)
      setHttpPort(originalPortsRef.current.httpPort)
      setHttpEnabled(originalPortsRef.current.httpEnabled)
      setRedirPort(originalPortsRef.current.redirPort)
      setRedirEnabled(originalPortsRef.current.redirEnabled)
      setTproxyPort(originalPortsRef.current.tproxyPort)
      setTproxyEnabled(originalPortsRef.current.tproxyEnabled)
      setOpen(true)
    },
    close: () => setOpen(false),
  }))

  // TODO 减少代码复杂度，性能开支
  const onSave = useLockFn(async () => {
    // 端口冲突检测
    const portList = [
      mixedPort,
      socksEnabled ? socksPort : -1,
      httpEnabled ? httpPort : -1,
      redirEnabled ? redirPort : -1,
      tproxyEnabled ? tproxyPort : -1,
    ].filter((p) => p !== -1)

    if (new Set(portList).size !== portList.length) {
      return
    }

    // 验证端口范围
    const isValidPort = (port: number) => port >= 1 && port <= 65535
    const allPortsValid = [
      mixedPort,
      socksEnabled ? socksPort : 0,
      httpEnabled ? httpPort : 0,
      redirEnabled ? redirPort : 0,
      tproxyEnabled ? tproxyPort : 0,
    ].every((port) => port === 0 || isValidPort(port))

    if (!allPortsValid) {
      return
    }

    const original = originalPortsRef.current
    const changedPorts: number[] = []

    if (mixedPort !== original?.mixedPort) changedPorts.push(mixedPort)
    if (socksEnabled && socksPort !== original?.socksPort)
      changedPorts.push(socksPort)
    if (httpEnabled && httpPort !== original?.httpPort)
      changedPorts.push(httpPort)
    if (redirEnabled && redirPort !== original?.redirPort)
      changedPorts.push(redirPort)
    if (tproxyEnabled && tproxyPort !== original?.tproxyPort)
      changedPorts.push(tproxyPort)

    for (const port of changedPorts) {
      try {
        const inUse = await isPortInUse(port)
        if (inUse) {
          showNotice.error('settings.modals.clashPort.messages.portInUse', {
            port,
          })
          if (original) {
            setMixedPort(original.mixedPort)
            setSocksPort(original.socksPort)
            setSocksEnabled(original.socksEnabled)
            setHttpPort(original.httpPort)
            setHttpEnabled(original.httpEnabled)
            setRedirPort(original.redirPort)
            setRedirEnabled(original.redirEnabled)
            setTproxyPort(original.tproxyPort)
            setTproxyEnabled(original.tproxyEnabled)
          } else {
            setMixedPort(
              verge?.verge_mixed_port ?? clashInfo?.mixed_port ?? 7897,
            )
            setSocksPort(verge?.verge_socks_port ?? 7898)
            setSocksEnabled(verge?.verge_socks_enabled ?? false)
            setHttpPort(verge?.verge_port ?? 7899)
            setHttpEnabled(verge?.verge_http_enabled ?? false)
            setRedirPort(verge?.verge_redir_port ?? 7895)
            setRedirEnabled(verge?.verge_redir_enabled ?? false)
            setTproxyPort(verge?.verge_tproxy_port ?? 7896)
            setTproxyEnabled(verge?.verge_tproxy_enabled ?? false)
          }
          return
        }
      } catch (error) {
        showNotice.error(error)
        return
      }
    }

    // 准备配置数据
    const clashConfig = {
      'mixed-port': mixedPort,
      'socks-port': socksPort,
      port: httpPort,
      'redir-port': redirPort,
      'tproxy-port': tproxyPort,
    }

    const vergeConfig = {
      verge_mixed_port: mixedPort,
      verge_socks_port: socksPort,
      verge_socks_enabled: socksEnabled,
      verge_port: httpPort,
      verge_http_enabled: httpEnabled,
      verge_redir_port: redirPort,
      verge_redir_enabled: redirEnabled,
      verge_tproxy_port: tproxyPort,
      verge_tproxy_enabled: tproxyEnabled,
    }

    // 提交保存请求
    saveSettings({ clashConfig, vergeConfig })
  })

  return (
    <BaseDialog
      open={open}
      title={t('settings.modals.clashPort.title')}
      contentSx={{
        width: 400,
      }}
      okBtn={
        loading ? (
          <span className="flex items-center gap-component">
            <Loader2 className="size-5 animate-spin" />
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
      <div className="w-full">
        <div className="flex min-h-9 items-center py-inline">
          <span className="flex-1 text-xs text-[var(--color-text-primary)]">
            {t('settings.modals.clashPort.fields.mixed')}
          </span>
          <div className="flex items-center">
            <Input
              className="mr-inline h-8 w-20 text-xs"
              value={mixedPort}
              onChange={(e) =>
                setMixedPort(+e.target.value?.replace(/\D+/, '').slice(0, 5))
              }
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-inline"
              onClick={() => setMixedPort(generateRandomPort())}
              title={t('settings.modals.clashPort.actions.random')}
            >
              <Shuffle className="size-4" />
            </Button>
            <Switch
              size="small"
              checked={true}
              disabled={true}
              className="ml-inline opacity-70"
            />
          </div>
        </div>

        <div className="flex min-h-9 items-center py-inline">
          <span className="flex-1 text-xs text-[var(--color-text-primary)]">
            {t('settings.modals.clashPort.fields.socks')}
          </span>
          <div className="flex items-center">
            <Input
              className="mr-inline h-8 w-20 text-xs"
              value={socksPort}
              onChange={(e) =>
                setSocksPort(+e.target.value?.replace(/\D+/, '').slice(0, 5))
              }
              disabled={!socksEnabled}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-inline"
              onClick={() => setSocksPort(generateRandomPort())}
              title={t('settings.modals.clashPort.actions.random')}
              disabled={!socksEnabled}
            >
              <Shuffle className="size-4" />
            </Button>
            <Switch
              size="small"
              checked={socksEnabled}
              onCheckedChange={(c) => setSocksEnabled(c)}
              className="ml-inline"
            />
          </div>
        </div>

        <div className="flex min-h-9 items-center py-inline">
          <span className="flex-1 text-xs text-[var(--color-text-primary)]">
            {t('settings.modals.clashPort.fields.http')}
          </span>
          <div className="flex items-center">
            <Input
              className="mr-inline h-8 w-20 text-xs"
              value={httpPort}
              onChange={(e) =>
                setHttpPort(+e.target.value?.replace(/\D+/, '').slice(0, 5))
              }
              disabled={!httpEnabled}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-inline"
              onClick={() => setHttpPort(generateRandomPort())}
              title={t('settings.modals.clashPort.actions.random')}
              disabled={!httpEnabled}
            >
              <Shuffle className="size-4" />
            </Button>
            <Switch
              size="small"
              checked={httpEnabled}
              onCheckedChange={(c) => setHttpEnabled(c)}
              className="ml-inline"
            />
          </div>
        </div>

        {OS !== 'windows' && (
          <div className="flex min-h-9 items-center py-inline">
            <span className="flex-1 text-xs text-[var(--color-text-primary)]">
              {t('settings.modals.clashPort.fields.redir')}
            </span>
            <div className="flex items-center">
              <Input
                className="mr-inline h-8 w-20 text-xs"
                value={redirPort}
                onChange={(e) =>
                  setRedirPort(+e.target.value?.replace(/\D+/, '').slice(0, 5))
                }
                disabled={!redirEnabled}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-inline"
                onClick={() => setRedirPort(generateRandomPort())}
                title={t('settings.modals.clashPort.actions.random')}
                disabled={!redirEnabled}
              >
                <Shuffle className="size-4" />
              </Button>
              <Switch
                size="small"
                checked={redirEnabled}
                onCheckedChange={(c) => setRedirEnabled(c)}
                className="ml-inline"
              />
            </div>
          </div>
        )}

        {OS === 'linux' && (
          <div className="flex min-h-9 items-center py-inline">
            <span className="flex-1 text-xs text-[var(--color-text-primary)]">
              {t('settings.modals.clashPort.fields.tproxy')}
            </span>
            <div className="flex items-center">
              <Input
                className="mr-inline h-8 w-20 text-xs"
                value={tproxyPort}
                onChange={(e) =>
                  setTproxyPort(+e.target.value?.replace(/\D+/, '').slice(0, 5))
                }
                disabled={!tproxyEnabled}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-inline"
                onClick={() => setTproxyPort(generateRandomPort())}
                title={t('settings.modals.clashPort.actions.random')}
                disabled={!tproxyEnabled}
              >
                <Shuffle className="size-4" />
              </Button>
              <Switch
                size="small"
                checked={tproxyEnabled}
                onCheckedChange={(c) => setTproxyEnabled(c)}
                className="ml-inline"
              />
            </div>
          </div>
        )}
      </div>
    </BaseDialog>
  )
})
