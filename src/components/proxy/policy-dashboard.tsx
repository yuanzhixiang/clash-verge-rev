import { NetworkCheckRounded } from '@mui/icons-material'
import { Box, Button, Typography } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseEmpty, BaseLoading } from '@/components/base'
import { useProxySelection } from '@/hooks/use-proxy-selection'
import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import delayManager from '@/services/delay'

import { PolicyGroupCard, PolicyProxyCard } from './policy-card'
import { PolicyGroupPopover } from './policy-group-popover'
import { ProviderButton } from './provider-button'

const MANUAL_GROUP_TYPES = new Set(['Selector', 'URLTest', 'Fallback'])
const PRESET_PROXY_NAMES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
])

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
  const [testingAll, setTestingAll] = useState(false)
  const [active, setActive] = useState<{
    anchorEl: HTMLElement
    groupName: string
  } | null>(null)

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

        {standaloneProxies.length === 0 ? (
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
              />
            ))}
          </Box>
        )}
      </Box>

      <Box component="section" sx={{ mt: 4.5 }}>
        <SectionHeader title={t('proxies.page.sections.policyGroup')} />

        {groups.length === 0 ? (
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
                  onClick={(event) => {
                    setActive((current) =>
                      current?.groupName === group.name
                        ? null
                        : {
                            anchorEl: event.currentTarget,
                            groupName: group.name,
                          },
                    )
                  }}
                />
              )
            })}
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
        onClose={() => setActive(null)}
        onUpdated={() => void refreshProxy()}
        onSelect={(group, proxy) => handleProxyGroupChange(group, proxy)}
      />
    </Box>
  )
}
