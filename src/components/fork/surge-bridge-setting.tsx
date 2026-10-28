import { Box, Button, Typography } from '@mui/material'
import { open } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/base'
import {
  SettingItem,
  SettingList,
} from '@/components/setting/mods/setting-comp'
import { showNotice } from '@/services/notice-service'
import { useThemeMode } from '@/services/states'

// Served by the fork plugin in src-tauri/src/fork; the webview origin authenticates the call.
const API = 'http://127.0.0.1:33380/api'
const POLL_MS = 5000

interface SurgeState {
  enabled: boolean
  path: string
  subscription_url: string
  status: {
    file_found: boolean
    converted_at: number | null
    stats: { proxies: number; groups: number; rules: number }
    warnings: string[]
    error: string | null
  }
}

interface ProfileRow {
  url: string | null
  current: boolean
}

const STRINGS = {
  zh: {
    title: 'Surge 配置',
    enable: '使用 Surge 配置',
    file: '配置文件',
    change: '更换',
    reveal: '打开配置文件所在文件夹',
    status: '转换状态',
    converted: (s: SurgeState['status']['stats'], at: string) =>
      `${s.proxies} 个节点 · ${s.groups} 个分组 · ${s.rules} 条规则 · ${at}`,
    disabled: '未启用',
    unreachable: '无法连接 Surge 桥接服务',
    warnings: (n: number) => `转换提示（${n}）`,
    none: '无',
    subscription: '订阅',
    active: '已启用',
    added: '已添加，未启用',
    notAdded: '未添加',
    importAction: '添加并启用',
    activateAction: '启用',
    imported: '已启用 Surge 订阅',
    refresh: '立即重新转换并刷新订阅',
    refreshed: (n: number) => `已刷新 ${n} 个订阅`,
  },
  en: {
    title: 'Surge Profile',
    enable: 'Use Surge profile',
    file: 'Profile file',
    change: 'Change',
    reveal: 'Open containing folder',
    status: 'Conversion',
    converted: (s: SurgeState['status']['stats'], at: string) =>
      `${s.proxies} proxies · ${s.groups} groups · ${s.rules} rules · ${at}`,
    disabled: 'Disabled',
    unreachable: 'Surge bridge is unreachable',
    warnings: (n: number) => `Conversion notes (${n})`,
    none: 'None',
    subscription: 'Subscription',
    active: 'Active',
    added: 'Added, not active',
    notAdded: 'Not added',
    importAction: 'Add and activate',
    activateAction: 'Activate',
    imported: 'Surge subscription activated',
    refresh: 'Reconvert and refresh subscription now',
    refreshed: (n: number) => `Refreshed ${n} subscription(s)`,
  },
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
  const response = await fetch(`${API}/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload?.error ?? response.statusText)
  return payload as T
}

const SurgeBridgeSetting = ({
  onError,
}: {
  onError?: (err: Error) => void
}) => {
  const { i18n } = useTranslation()
  const s = i18n.language.startsWith('zh') ? STRINGS.zh : STRINGS.en
  const isDark = useThemeMode() !== 'light'

  const [state, setState] = useState<SurgeState | null>(null)
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [unreachable, setUnreachable] = useState(false)
  const [showWarnings, setShowWarnings] = useState(false)

  const load = useCallback(async () => {
    try {
      const [surge, rows] = await Promise.all([
        call<SurgeState>('GET', 'surge'),
        call<ProfileRow[]>('GET', 'profiles'),
      ])
      setState(surge)
      setProfiles(rows)
      setUnreachable(false)
    } catch {
      setUnreachable(true)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const run = useLockFn(async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (err) {
      onError?.(err as Error)
    } finally {
      await load()
    }
  })

  const profile = profiles.find((row) => row.url === state?.subscription_url)
  const status = state?.status
  const convertedAt = status?.converted_at
    ? new Date(status.converted_at).toLocaleTimeString()
    : ''

  let statusText = s.disabled
  if (unreachable) statusText = s.unreachable
  else if (state?.enabled && status?.error) statusText = status.error
  else if (state?.enabled && status?.converted_at)
    statusText = s.converted(status.stats, convertedAt)

  return (
    <Box
      sx={{
        borderRadius: 2,
        marginTop: 1.5,
        backgroundColor: isDark ? '#282a36' : '#ffffff',
      }}
    >
      <SettingList title={s.title}>
        <SettingItem label={s.enable}>
          <Switch
            edge="end"
            checked={state?.enabled ?? false}
            disabled={unreachable}
            onChange={(_, enabled) =>
              run(() => call('POST', 'surge', { enabled }))
            }
          />
        </SettingItem>

        <SettingItem
          label={s.file}
          secondary={
            <Typography
              variant="caption"
              sx={{ wordBreak: 'break-all', opacity: 0.7 }}
            >
              {state?.path}
            </Typography>
          }
        >
          <Button
            size="small"
            variant="outlined"
            disabled={unreachable}
            onClick={() =>
              run(async () => {
                const path = await open({
                  directory: false,
                  multiple: false,
                  filters: [{ name: 'Surge', extensions: ['conf'] }],
                })
                if (typeof path === 'string') {
                  await call('POST', 'surge', { path })
                }
              })
            }
          >
            {s.change}
          </Button>
        </SettingItem>

        <SettingItem
          label={s.reveal}
          onClick={() => run(() => call('POST', 'surge/reveal'))}
        />

        <SettingItem label={s.status} secondary={statusText} />

        <SettingItem
          label={s.warnings(status?.warnings.length ?? 0)}
          onClick={() => setShowWarnings((value) => !value)}
          secondary={
            showWarnings ? (
              <Box component="span" sx={{ display: 'block' }}>
                {(status?.warnings.length ?? 0) === 0
                  ? s.none
                  : status?.warnings.map((warning) => (
                      <Typography
                        key={warning}
                        component="span"
                        variant="caption"
                        sx={{ display: 'block', opacity: 0.7 }}
                      >
                        {warning}
                      </Typography>
                    ))}
              </Box>
            ) : undefined
          }
        />

        <SettingItem
          label={s.subscription}
          secondary={
            profile?.current ? s.active : profile ? s.added : s.notAdded
          }
        >
          {!profile?.current && (
            <Button
              size="small"
              variant="contained"
              disabled={unreachable || !state?.enabled}
              onClick={() =>
                run(async () => {
                  await call('POST', 'surge/import')
                  showNotice.success(s.imported)
                })
              }
            >
              {profile ? s.activateAction : s.importAction}
            </Button>
          )}
        </SettingItem>

        <SettingItem
          label={s.refresh}
          onClick={() =>
            run(async () => {
              const result = await call<{ refreshed: number }>(
                'POST',
                'surge/refresh',
              )
              showNotice.success(s.refreshed(result.refreshed))
            })
          }
        />
      </SettingList>
    </Box>
  )
}

export default SurgeBridgeSetting
