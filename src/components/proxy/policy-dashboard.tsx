import {
  ContentCopyRounded,
  DeleteOutlineRounded,
  EditRounded,
  NetworkCheckRounded,
  SpeedRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, BaseEmpty, BaseLoading } from '@/components/base'
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
  getEntryYaml,
  parseYamlEntry,
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
  <Box
    sx={{
      display: 'flex',
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      mb: 1.5,
    }}
  >
    <Typography
      component="h2"
      color="primary.main"
      sx={{
        fontSize: 12,
        fontWeight: 650,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {title}
    </Typography>
    {actions && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {actions}
      </Box>
    )}
  </Box>
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
    groupName: string
  } | null>(null)
  const [proxyMenu, setProxyMenu] = useState<ProxyMenuState | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const profileUid = profiles?.current
  const canEdit = Boolean(profileUid) && currentProfile?.type === 'local'

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
      initialText: kind === 'proxy' ? PROXY_TEMPLATE : GROUP_TEMPLATE,
    })
  }

  const openEditEditor = async (kind: EntryKind, name: string) => {
    if (!profileUid) return
    try {
      const initialText = await getEntryYaml(profileUid, kind, name)
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
      const entry = parseYamlEntry(text)
      if (editor.oldName === null) {
        await addEntry(profileUid, editor.kind, entry)
      } else {
        await editEntry(profileUid, editor.kind, editor.oldName, entry)
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
      await duplicateEntry(profileUid, kind, name)
      await afterProfileMutation()
    } catch (err) {
      notifyEditError(err)
    }
  })

  const handleConfirmDelete = useLockFn(async () => {
    if (!confirm || !profileUid) return
    try {
      await deleteEntry(profileUid, confirm.kind, confirm.name)
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
      <Box sx={{ display: 'grid', height: '100%', placeItems: 'center' }}>
        <BaseLoading />
      </Box>
    )
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        px: { xs: 2, sm: 3 },
        pb: 3,
        scrollbarGutter: 'stable',
      }}
    >
      <Box component="section" sx={{ mt: 2.5 }}>
        <SectionHeader
          title={t('proxies.page.sections.proxy')}
          actions={
            <>
              <Button
                variant="text"
                size="small"
                loading={testingAll}
                disabled={testingAll || standaloneProxies.length === 0}
                onClick={() => void handleTestAll()}
                startIcon={<NetworkCheckRounded fontSize="small" />}
                sx={{ height: 36, bgcolor: 'var(--shell-panel-muted)' }}
              >
                {t('proxies.page.actions.testAll')}
              </Button>
              <ProviderButton />
            </>
          }
        />

        {standaloneProxies.length === 0 && !canEdit ? (
          <Box sx={{ minHeight: 112 }}>
            <BaseEmpty text={t('proxies.page.messages.noNodes')} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 240px))',
              gap: 1.5,
            }}
          >
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
          </Box>
        )}
      </Box>

      <Box component="section" sx={{ mt: 4.5 }}>
        <SectionHeader title={t('proxies.page.sections.policyGroup')} />

        {groups.length === 0 && !canEdit ? (
          <Box sx={{ minHeight: 112 }}>
            <BaseEmpty text={t('proxies.page.messages.noGroups')} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 240px))',
              gap: 1.5,
            }}
          >
            {groups.map((group) => {
              const open = active?.groupName === group.name
              return (
                <PolicyGroupCard
                  key={group.name}
                  group={group}
                  open={open}
                  readonly={!MANUAL_GROUP_TYPES.has(group.type)}
                  onOpenMenu={(anchorEl) => {
                    setActive({ anchorEl, groupName: group.name })
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
          </Box>
        )}
      </Box>

      <PolicyGroupPopover
        key={active?.groupName ?? 'closed'}
        anchorEl={active?.anchorEl ?? null}
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

      <Menu
        open={Boolean(proxyMenu)}
        onClose={() => setProxyMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={proxyMenu?.position}
        slotProps={{ list: { sx: { py: 0.5 } } }}
        onContextMenu={(event) => {
          event.preventDefault()
          setProxyMenu(null)
        }}
      >
        {canEdit && (
          <MenuItem
            dense
            onClick={() => {
              const target = proxyMenu?.proxy
              setProxyMenu(null)
              if (target) void openEditEditor('proxy', target.name)
            }}
          >
            <ListItemIcon>
              <EditRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('proxies.page.menus.editProxy')}</ListItemText>
          </MenuItem>
        )}
        {canEdit && (
          <MenuItem
            dense
            onClick={() => {
              const target = proxyMenu?.proxy
              setProxyMenu(null)
              if (target) void handleDuplicate('proxy', target.name)
            }}
          >
            <ListItemIcon>
              <ContentCopyRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('proxies.page.menus.duplicate')}</ListItemText>
          </MenuItem>
        )}
        {canEdit && (
          <MenuItem
            dense
            onClick={() => {
              const target = proxyMenu?.proxy
              setProxyMenu(null)
              if (target) setConfirm({ kind: 'proxy', name: target.name })
            }}
            sx={({ palette }) => ({ color: palette.error.main })}
          >
            <ListItemIcon>
              <DeleteOutlineRounded fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>{t('proxies.page.menus.deleteProxy')}</ListItemText>
          </MenuItem>
        )}
        {canEdit && <Divider sx={{ my: 0.5 }} />}
        <MenuItem
          dense
          onClick={() => {
            const target = proxyMenu?.proxy
            setProxyMenu(null)
            if (target) handleMenuTestLatency(target)
          }}
        >
          <ListItemIcon>
            <SpeedRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('proxies.page.menus.testLatency')}</ListItemText>
        </MenuItem>
      </Menu>

      <PolicyYamlDialog
        key={editor ? `${editor.kind}-${editor.oldName ?? 'new'}` : 'closed'}
        open={Boolean(editor)}
        title={editor?.title ?? ''}
        initialText={editor?.initialText ?? ''}
        saving={saving}
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
        <Typography variant="body2">
          {confirm
            ? t(
                confirm.kind === 'group'
                  ? 'proxies.page.dialogs.deleteGroupMessage'
                  : 'proxies.page.dialogs.deleteProxyMessage',
                { name: confirm.name },
              )
            : ''}
        </Typography>
      </BaseDialog>
    </Box>
  )
}
