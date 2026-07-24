import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { forwardRef, useImperativeHandle, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useClash } from '@/hooks/use-clash'
import { useProxiesData } from '@/providers/app-data-context'
import { isPortInUse } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  formatHostPort,
  isValidPort,
  normalizeHost,
  normalizeListenHost,
} from '@/utils/network'

interface TunnelsViewerRef {
  open: () => void
  close: () => void
}

interface TunnelEntry {
  network: string[]
  address: string
  target: string
  proxy?: string
}

// Radix Select 不允许空字符串作为 item value，用哨兵值代表“默认（不指定）”
const DEFAULT_OPTION = '__default__'

export const TunnelsViewer = forwardRef<TunnelsViewerRef>((_, ref) => {
  const { t } = useTranslation()
  const { clash, mutateClash, patchClash } = useClash()

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [values, setValues] = useState({
    localAddr: '',
    localPort: '',
    targetAddr: '',
    targetPort: '',
    network: 'tcp+udp',
    group: '',
    proxy: '',
  })
  const [draftTunnels, setDraftTunnels] = useState<TunnelEntry[]>([])

  useImperativeHandle(ref, () => ({
    open: () => {
      setValues(() => ({
        localAddr: '',
        localPort: '',
        targetAddr: '',
        targetPort: '',
        network: 'tcp+udp',
        group: '',
        proxy: '',
      }))
      setDraftTunnels(() => clash?.tunnels ?? [])
      setOpen(true)
      // 如果没有隧道，则自动展开
      setExpanded((clash?.tunnels ?? []).length === 0)
    },
    close: () => {
      setOpen(false)
    },
  }))

  const tunnelEntries = useMemo(() => {
    const counts: Record<string, number> = {}
    return draftTunnels.map((tunnel, index) => {
      const base = `${tunnel.address}_${tunnel.target}_${tunnel.network.join('+')}`
      const occurrence = (counts[base] = (counts[base] ?? 0) + 1)
      return {
        index,
        key: `${base}_${occurrence}`,
        address: tunnel.address,
        target: tunnel.target,
        network: tunnel.network,
        proxy: tunnel.proxy,
      }
    })
  }, [draftTunnels])

  const { proxies } = useProxiesData()

  const proxyGroups = useMemo<IProxyGroupItem[]>(() => {
    return proxies?.groups ?? []
  }, [proxies])

  const groupNames = useMemo<string[]>(
    () => proxyGroups.map((group) => group.name),
    [proxyGroups],
  )

  const proxyOptions = useMemo<IProxyItem[]>(() => {
    const group = proxyGroups.find((item) => item.name === values.group)
    return group?.all ?? []
  }, [proxyGroups, values.group])

  const handleSave = async () => {
    try {
      await patchClash({ tunnels: draftTunnels })
      await mutateClash()
      showNotice.success('shared.feedback.notifications.common.saveSuccess')
      setOpen(false)
    } catch (err: any) {
      showNotice.error(err)
    }
  }

  const handleAdd = async () => {
    const { localAddr, localPort, targetAddr, targetPort, network, proxy } =
      values

    // 基础非空校验
    if (!localAddr || !localPort || !targetAddr || !targetPort) {
      showNotice.error(
        'settings.sections.clash.form.fields.tunnels.messages.incomplete',
      )
      return
    }

    // 本地地址校验（host）
    const localHost = normalizeListenHost(localAddr)
    if (!localHost) {
      showNotice.error(
        'settings.sections.clash.form.fields.tunnels.messages.invalidLocalAddr',
      )
      return
    }

    // 本地端口校验 (port)
    if (!isValidPort(localPort)) {
      showNotice.error(
        'settings.sections.clash.form.fields.tunnels.messages.invalidLocalPort',
      )
      return
    }
    const inUse = await isPortInUse(Number(localPort))
    if (inUse) {
      showNotice.error('settings.modals.clashPort.messages.portInUse', {
        port: localPort,
      })
      return
    }

    // 目标地址校验 (host)
    const targetHost = normalizeHost(targetAddr)
    if (!targetHost) {
      showNotice.error(
        'settings.sections.clash.form.fields.tunnels.messages.invalidTargetAddr',
      )
      return
    }

    // 目标端口校验 (port)
    if (!isValidPort(targetPort)) {
      showNotice.error(
        'settings.sections.clash.form.fields.tunnels.messages.invalidTargetPort',
      )
      return
    }

    // 构造新 entry
    const entry: TunnelEntry = {
      network: network === 'tcp+udp' ? ['tcp', 'udp'] : [network],
      address: formatHostPort(localHost, localPort),
      target: formatHostPort(targetHost, targetPort),
      ...(proxy ? { proxy } : {}),
    }

    // 写入配置 + 清空输入
    setDraftTunnels((prev) => [...prev, entry])

    setValues((v) => ({
      ...v,
      localAddr: '',
      localPort: '',
      targetAddr: '',
      targetPort: '',
      network: 'tcp+udp',
    }))
  }

  const handleDelete = (index: number) => {
    setDraftTunnels((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <BaseDialog
      open={open}
      title={t('settings.sections.clash.form.fields.tunnels.title')}
      contentSx={{ width: 450 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => {
        setOpen(false)
      }}
      onCancel={() => {
        setOpen(false)
      }}
      onOk={handleSave}
    >
      <div className="py-component">
        {draftTunnels.length > 0 && (
          <>
            <div className="flex items-center py-[4px] opacity-60">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.existing')}
              </span>
            </div>
            <div>
              {tunnelEntries.map((item) => (
                <div
                  key={`${item.key}`}
                  className="flex items-center gap-component py-[4px]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body">{`${item.address} → ${item.target}`}</p>
                    <p className="truncate text-caption text-[var(--color-text-secondary)]">
                      {`${item.network.join(', ')} · ${
                        item.proxy ??
                        t('settings.sections.clash.form.fields.tunnels.default')
                      }`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-[var(--color-danger)]"
                    onClick={() => handleDelete(item.index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Separator className="my-inset" />
          </>
        )}
        <button
          type="button"
          className="flex w-full items-center py-[4px] text-left opacity-80"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="flex-1">
            {t('settings.sections.clash.form.fields.tunnels.actions.addNew')}
          </span>
          {expanded ? (
            <ChevronUp className="size-5" />
          ) : (
            <ChevronDown className="size-5" />
          )}
        </button>
        {expanded && (
          <div className="w-full py-component">
            {/* 输入框区域 */}
            {/* 协议 */}
            <div className="flex items-center gap-component py-compact px-adjust">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.protocols')}
              </span>
              <Select
                value={values.network}
                onValueChange={(value) =>
                  setValues((v) => ({ ...v, network: value }))
                }
              >
                <SelectTrigger size="sm" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                  <SelectItem value="tcp+udp">TCP + UDP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 本地监听地址 */}
            <div className="flex items-center gap-component py-compact px-adjust">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.localAddr')}
              </span>
              <Input
                autoComplete="new-password"
                className="h-8 w-[200px]"
                value={values.localAddr}
                placeholder="127.0.0.1"
                onChange={(e) =>
                  setValues((v) => ({ ...v, localAddr: e.target.value }))
                }
              />
            </div>

            {/* 本地监听端口 */}
            <div className="flex items-center gap-component py-compact px-adjust">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.localPort')}
              </span>
              <Input
                autoComplete="new-password"
                type="number"
                className="h-8 w-[200px]"
                value={values.localPort}
                placeholder="6553"
                onChange={(e) =>
                  setValues((v) => ({ ...v, localPort: e.target.value }))
                }
              />
            </div>

            {/* 目标服务器地址 */}
            <div className="flex items-center gap-component py-compact px-adjust">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.targetAddr')}
              </span>
              <Input
                autoComplete="new-password"
                className="h-8 w-[200px]"
                value={values.targetAddr}
                placeholder="8.8.8.8"
                onChange={(e) =>
                  setValues((v) => ({ ...v, targetAddr: e.target.value }))
                }
              />
            </div>

            {/* 目标服务器端口 */}
            <div className="flex items-center gap-component py-compact px-adjust">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.targetPort')}
              </span>
              <Input
                autoComplete="new-password"
                type="number"
                className="h-8 w-[200px]"
                value={values.targetPort}
                placeholder="53"
                onChange={(e) =>
                  setValues((v) => ({ ...v, targetPort: e.target.value }))
                }
              />
            </div>

            {/* 代理组 */}
            <div className="flex items-center gap-component py-compact px-adjust">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.proxyGroup')}
                <span className="text-caption text-[var(--color-text-muted)]">
                  {' '}
                  ({t('settings.sections.clash.form.fields.tunnels.optional')})
                </span>
              </span>
              <Select
                value={values.group || DEFAULT_OPTION}
                onValueChange={(value) => {
                  const nextGroup = value === DEFAULT_OPTION ? '' : value
                  const group = proxyGroups.find((g) => g.name === nextGroup)
                  const firstProxy = group?.all?.[0].name ?? ''

                  setValues((v) => ({
                    ...v,
                    group: nextGroup,
                    proxy: firstProxy, // 组切换时自动选第一条节点
                  }))
                }}
              >
                <SelectTrigger size="sm" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_OPTION}>
                    {t('settings.sections.clash.form.fields.tunnels.default')}
                  </SelectItem>
                  {groupNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 代理节点 */}
            <div className="flex items-center gap-component py-compact px-adjust">
              <span className="flex-1">
                {t('settings.sections.clash.form.fields.tunnels.proxyNode')}
                <span className="text-caption text-[var(--color-text-muted)]">
                  {' '}
                  ({t('settings.sections.clash.form.fields.tunnels.optional')})
                </span>
              </span>
              <Select
                value={values.proxy || DEFAULT_OPTION}
                onValueChange={(value) =>
                  setValues((v) => ({
                    ...v,
                    proxy: value === DEFAULT_OPTION ? '' : value,
                  }))
                }
                disabled={!values.group} // 没选组就禁用
              >
                <SelectTrigger size="sm" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_OPTION}>
                    {t('settings.sections.clash.form.fields.tunnels.default')}
                  </SelectItem>
                  {proxyOptions.map((node) => (
                    <SelectItem key={node.name} value={node.name}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 添加按钮 */}
            <div className="mt-compact flex justify-end pr-adjust">
              <Button
                size="sm"
                className="bg-[var(--color-success)] text-white hover:opacity-90"
                onClick={handleAdd}
              >
                {t('settings.sections.clash.form.fields.tunnels.actions.add')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BaseDialog>
  )
})
