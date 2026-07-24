import { useLockFn } from 'ahooks'
import { Copy, Gauge, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseEmpty, BaseLoading } from '@/components/base'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProfiles } from '@/hooks/use-profiles'
import { useProxySelection } from '@/hooks/use-proxy-selection'
import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import delayManager from '@/services/delay'
import { showNotice } from '@/services/notice-service'
import {
  type EntryKind,
  ProfileEditError,
  addEntry,
  deleteEntry,
  duplicateEntry,
  editEntry,
  getEntryText,
  parseProfileEntry,
} from '@/services/profile-editor'

import { PolicyAddCard, PolicyGroupCard, PolicyProxyCard } from './policy-card'
import { PolicyGroupPopover } from './policy-group-popover'
import { PolicyYamlDialog } from './policy-yaml-dialog'
import { ProviderButton } from './provider-button'

const MANUAL_GROUP_TYPES = new Set(['Selector', 'URLTest', 'Fallback'])
const PRESET_PROXY_NAMES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
])

const PROXY_TEMPLATE = `name: new-proxy
type: ss
server: example.com
port: 443
cipher: aes-128-gcm
password: password
`

const GROUP_TEMPLATE = `name: new-group
type: select
proxies:
  - DIRECT
`

const PROXY_CONF_TEMPLATE = `new-proxy = ss, example.com, 443, cipher=aes-128-gcm, password=password`

const GROUP_CONF_TEMPLATE = `new-group = select, DIRECT`

interface EditorState {
  kind: EntryKind
  /** 编辑既有条目时为原名称，新建时为 null。 */
  oldName: string | null
  title: string
  initialText: string
}

interface ConfirmState {
  kind: EntryKind
  name: string
}

interface ProxyMenuState {
  position: { left: number; top: number }
  proxy: IProxyItem
}

const SectionHeader = ({
  title,
  actions,
}: {
  title: string
  actions?: React.ReactNode
}) => (
  <div className="mb-stack flex min-h-[38px] items-center justify-between gap-inset">
    <h2 className="text-xs font-[650] tracking-[0.08em] text-[var(--color-accent)] uppercase">
      {title}
    </h2>
    {actions && (
      <div className="flex items-center gap-component">{actions}</div>
    )}
  </div>
)

export const PolicyDashboard = () => {
  const { t } = useTranslation()
  const { proxies, proxyProviders, isProxiesPending } = useProxiesData()
  const { refreshProxy } = useAppRefreshers()
  const { verge } = useVerge()
  const { profiles, current: currentProfile, mutateProfiles } = useProfiles()
  const [testingAll, setTestingAll] = useState(false)
  const [active, setActive] = useState<{
    anchorEl: HTMLElement
    /** 右键时的鼠标坐标；键盘打开时缺省，浮层退回锚定卡片。 */
    position?: { top: number; left: number }
    groupName: string
  } | null>(null)
  const [proxyMenu, setProxyMenu] = useState<ProxyMenuState | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const profileUid = profiles?.current
  const canEdit = Boolean(profileUid) && currentProfile?.type === 'local'
  const profileFormat =
    currentProfile?.profile_format === 'conf' ? 'conf' : 'yaml'

  const groups = useMemo(
    () =>
      ((proxies?.groups as IProxyGroupItem[] | undefined) ?? []).filter(
        (group) => !group.hidden,
      ),
    [proxies?.groups],
  )

  const standaloneProxies = useMemo(() => {
    const seen = new Set<string>()
    const providerNodes = new Set(
      Object.values(proxyProviders ?? {}).flatMap((provider) =>
        provider?.proxies.map((proxy) => proxy.name),
      ),
    )
    // "组名 / 节点名" 是 Surge policy-path 组展开节点的命名约定，
    // 这类节点只通过策略组浮层访问，与 provider 节点一样不进 Proxy 区
    const groupPrefixes = (
      (proxies?.groups as IProxyGroupItem[] | undefined) ?? []
    ).map((group) => `${group.name} / `)
    const providerPrefixes = Object.keys(proxyProviders ?? {}).map(
      (providerName) => `${providerName} / `,
    )
    const hiddenPrefixes = [...providerPrefixes, ...groupPrefixes]
    return ((proxies?.proxies as IProxyItem[] | undefined) ?? []).filter(
      (proxy) => {
        if (!proxy?.name || PRESET_PROXY_NAMES.has(proxy.name)) return false
        if (
          proxy.provider ||
          providerNodes.has(proxy.name) ||
          hiddenPrefixes.some((prefix) => proxy.name.startsWith(prefix))
        ) {
          return false
        }
        const type = proxy.type?.toLowerCase() ?? ''
        if (
          type.includes('direct') ||
          type.includes('reject') ||
          type.includes('pass') ||
          type.includes('compatible')
        ) {
          return false
        }
        if (seen.has(proxy.name)) return false
        seen.add(proxy.name)
        return true
      },
    )
  }, [proxies?.proxies, proxies?.groups, proxyProviders])
  const activeGroup = useMemo(
    () => groups.find((group) => group.name === active?.groupName) ?? null,
    [active?.groupName, groups],
  )

  const { handleProxyGroupChange } = useProxySelection({
    onSuccess: () => void refreshProxy(),
    onError: () => void refreshProxy(),
  })

  const handleTestAll = useLockFn(async () => {
    if (testingAll || standaloneProxies.length === 0) return
    setTestingAll(true)
    try {
      const timeout = verge?.default_latency_timeout || 10000
      const url =
        verge?.default_latency_test?.trim() ||
        'http://cp.cloudflare.com/generate_204'
      delayManager.setUrl('policy-standalone', url)
      await delayManager.checkListDelay(
        standaloneProxies,
        'policy-standalone',
        timeout,
      )
      await refreshProxy()
    } finally {
      setTestingAll(false)
    }
  })

  const notifyEditError = (err: unknown) => {
    if (err instanceof ProfileEditError) {
      showNotice.error(`proxies.feedback.editor.${err.code}`, {
        detail: err.detail,
      })
    } else {
      showNotice.error(err as Error)
    }
  }

  const afterProfileMutation = async () => {
    await mutateProfiles()
    await refreshProxy()
  }

  const openCreateEditor = (kind: EntryKind) => {
    setEditor({
      kind,
      oldName: null,
      title: t(
        kind === 'proxy'
          ? 'proxies.page.dialogs.newProxy'
          : 'proxies.page.dialogs.newGroup',
      ),
      initialText:
        profileFormat === 'conf'
          ? kind === 'proxy'
            ? PROXY_CONF_TEMPLATE
            : GROUP_CONF_TEMPLATE
          : kind === 'proxy'
            ? PROXY_TEMPLATE
            : GROUP_TEMPLATE,
    })
  }

  const openEditEditor = async (kind: EntryKind, name: string) => {
    if (!profileUid) return
    try {
      const initialText = await getEntryText(
        profileUid,
        kind,
        name,
        profileFormat,
      )
      setEditor({
        kind,
        oldName: name,
        title: t(
          kind === 'proxy'
            ? 'proxies.page.dialogs.editProxy'
            : 'proxies.page.dialogs.editGroup',
        ),
        initialText,
      })
    } catch (err) {
      notifyEditError(err)
    }
  }

  const handleEditorSave = async (text: string) => {
    if (!editor || !profileUid) return
    setSaving(true)
    try {
      const entry = parseProfileEntry(text, profileFormat, editor.kind)
      if (editor.oldName === null) {
        await addEntry(profileUid, editor.kind, entry, profileFormat)
      } else {
        await editEntry(
          profileUid,
          editor.kind,
          editor.oldName,
          entry,
          profileFormat,
        )
      }
      setEditor(null)
      await afterProfileMutation()
    } catch (err) {
      notifyEditError(err)
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicate = useLockFn(async (kind: EntryKind, name: string) => {
    if (!profileUid) return
    try {
      await duplicateEntry(profileUid, kind, name, profileFormat)
      await afterProfileMutation()
    } catch (err) {
      notifyEditError(err)
    }
  })

  const handleConfirmDelete = useLockFn(async () => {
    if (!confirm || !profileUid) return
    try {
      await deleteEntry(profileUid, confirm.kind, confirm.name, profileFormat)
      setConfirm(null)
      await afterProfileMutation()
    } catch (err) {
      notifyEditError(err)
    }
  })

  const handleMenuTestLatency = (proxy: IProxyItem) => {
    const timeout = verge?.default_latency_timeout || 10000
    void delayManager.checkDelay(
      proxy.name,
      'policy-standalone',
      timeout,
      proxy.provider,
    )
  }

  if (isProxiesPending && !proxies) {
    return (
      <div className="grid h-full place-items-center">
        <BaseLoading />
      </div>
    )
  }

  return (
    <div className="px-inset pb-block sm:px-block">
      <section className="mt-5">
        <SectionHeader
          title={t('proxies.page.sections.proxy')}
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={testingAll || standaloneProxies.length === 0}
                onClick={() => void handleTestAll()}
                className="h-9 gap-1.5 bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                {testingAll ? <Loader2 className="animate-spin" /> : <Gauge />}
                {t('proxies.page.actions.testAll')}
              </Button>
              <ProviderButton />
            </>
          }
        />

        {standaloneProxies.length === 0 && !canEdit ? (
          <div className="min-h-[112px]">
            <BaseEmpty text={t('proxies.page.messages.noNodes')} />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,240px))] gap-stack">
            {standaloneProxies.map((proxy) => (
              <PolicyProxyCard
                key={proxy.name}
                proxy={proxy}
                testLabel={t('proxies.page.actions.test')}
                onContextMenu={(event, target) => {
                  setProxyMenu({
                    position: { left: event.clientX, top: event.clientY },
                    proxy: target,
                  })
                }}
              />
            ))}
            {canEdit && (
              <PolicyAddCard
                label={t('proxies.page.actions.addProxy')}
                onClick={() => openCreateEditor('proxy')}
              />
            )}
          </div>
        )}
      </section>

      <section className="mt-9">
        <SectionHeader title={t('proxies.page.sections.policyGroup')} />

        {groups.length === 0 && !canEdit ? (
          <div className="min-h-[112px]">
            <BaseEmpty text={t('proxies.page.messages.noGroups')} />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,240px))] gap-stack">
            {groups.map((group) => {
              const open = active?.groupName === group.name
              return (
                <PolicyGroupCard
                  key={group.name}
                  group={group}
                  open={open}
                  readonly={!MANUAL_GROUP_TYPES.has(group.type)}
                  onOpenMenu={(anchorEl, position) => {
                    setActive({ anchorEl, position, groupName: group.name })
                  }}
                />
              )
            })}
            {canEdit && (
              <PolicyAddCard
                label={t('proxies.page.actions.addGroup')}
                onClick={() => openCreateEditor('group')}
              />
            )}
          </div>
        )}
      </section>

      <PolicyGroupPopover
        key={active?.groupName ?? 'closed'}
        anchorEl={active?.anchorEl ?? null}
        position={active?.position}
        group={activeGroup}
        readonly={
          activeGroup ? !MANUAL_GROUP_TYPES.has(activeGroup.type) : false
        }
        canEdit={canEdit}
        onClose={() => setActive(null)}
        onUpdated={() => void refreshProxy()}
        onSelect={(group, proxy) => handleProxyGroupChange(group, proxy)}
        onEdit={(group) => {
          setActive(null)
          void openEditEditor('group', group.name)
        }}
        onDuplicate={(group) => {
          setActive(null)
          void handleDuplicate('group', group.name)
        }}
        onDelete={(group) => {
          setActive(null)
          setConfirm({ kind: 'group', name: group.name })
        }}
      />

      <DropdownMenu
        open={Boolean(proxyMenu)}
        onOpenChange={(o) => {
          if (!o) setProxyMenu(null)
        }}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed"
            style={{
              left: proxyMenu?.position.left ?? 0,
              top: proxyMenu?.position.top ?? 0,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={0}
          onContextMenu={(event) => event.preventDefault()}
        >
          {canEdit && (
            <DropdownMenuItem
              onSelect={() => {
                const target = proxyMenu?.proxy
                if (target) void openEditEditor('proxy', target.name)
              }}
            >
              <Pencil />
              {t('proxies.page.menus.editProxy')}
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              onSelect={() => {
                const target = proxyMenu?.proxy
                if (target) void handleDuplicate('proxy', target.name)
              }}
            >
              <Copy />
              {t('proxies.page.menus.duplicate')}
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                const target = proxyMenu?.proxy
                if (target) setConfirm({ kind: 'proxy', name: target.name })
              }}
            >
              <Trash2 />
              {t('proxies.page.menus.deleteProxy')}
            </DropdownMenuItem>
          )}
          {canEdit && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onSelect={() => {
              const target = proxyMenu?.proxy
              if (target) handleMenuTestLatency(target)
            }}
          >
            <Gauge />
            {t('proxies.page.menus.testLatency')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PolicyYamlDialog
        key={editor ? `${editor.kind}-${editor.oldName ?? 'new'}` : 'closed'}
        open={Boolean(editor)}
        title={editor?.title ?? ''}
        initialText={editor?.initialText ?? ''}
        saving={saving}
        format={profileFormat}
        onCancel={() => setEditor(null)}
        onSave={(text) => void handleEditorSave(text)}
      />

      <BaseDialog
        open={Boolean(confirm)}
        title={t(
          confirm?.kind === 'group'
            ? 'proxies.page.dialogs.deleteGroupTitle'
            : 'proxies.page.dialogs.deleteProxyTitle',
        )}
        okBtn={t('shared.actions.confirm')}
        cancelBtn={t('shared.actions.cancel')}
        contentSx={{ width: { xs: 320, sm: 420 }, userSelect: 'text' }}
        onCancel={() => setConfirm(null)}
        onClose={() => setConfirm(null)}
        onOk={() => void handleConfirmDelete()}
      >
        <p className="text-body text-[var(--color-text-secondary)]">
          {confirm
            ? t(
                confirm.kind === 'group'
                  ? 'proxies.page.dialogs.deleteGroupMessage'
                  : 'proxies.page.dialogs.deleteProxyMessage',
                { name: confirm.name },
              )
            : ''}
        </p>
      </BaseDialog>
    </div>
  )
}
