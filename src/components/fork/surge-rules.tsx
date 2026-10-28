import { DeleteOutlineRounded, EditNoteRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppRefreshers } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'

import { call, useSurgeActive } from './fork-api'

const LAST_POLICY_KEY = 'fork.surge-rule.policy'
const LIST_LIMIT = 200

interface RuleEntry {
  type: string
  value: string
  policy: string
  editable: boolean
}

interface RulesState {
  rules: RuleEntry[]
  policies: string[]
  kinds: string[]
}

interface Prefill {
  host?: string
  ip?: string
}

const STRINGS = {
  zh: {
    button: 'Surge 规则',
    action: '添加 Surge 规则',
    title: 'Surge 规则',
    value: '域名 / IP',
    type: '类型',
    policy: '策略',
    add: '添加到最前面',
    change: (from: string) => `修改（当前 ${from}）`,
    hint: '写入 Surge 配置 [Rule] 段最前面；已有同一规则时只改策略。保存后命中的连接会被断开并按新规则重连。',
    search: '搜索已有规则',
    more: (n: number) => `还有 ${n} 条，请输入关键词缩小范围`,
    readonly: '仅能在配置文件中编辑',
    close: '关闭',
    saved: (rule: string, closed: number) =>
      `已保存 ${rule}，断开 ${closed} 个连接`,
    unchanged: '规则没有变化',
    removed: (rule: string, closed: number) =>
      `已删除 ${rule}，断开 ${closed} 个连接`,
  },
  en: {
    button: 'Surge Rules',
    action: 'Add Surge rule',
    title: 'Surge Rules',
    value: 'Domain / IP',
    type: 'Type',
    policy: 'Policy',
    add: 'Add to top',
    change: (from: string) => `Update (now ${from})`,
    hint: 'Written to the top of [Rule] in the Surge profile; an existing rule only gets its policy changed. Matching connections are closed so they reconnect with the new rule.',
    search: 'Search rules',
    more: (n: number) => `${n} more, type to narrow down`,
    readonly: 'Edit this one in the profile file',
    close: 'Close',
    saved: (rule: string, closed: number) =>
      `Saved ${rule}, closed ${closed} connection(s)`,
    unchanged: 'Rule unchanged',
    removed: (rule: string, closed: number) =>
      `Removed ${rule}, closed ${closed} connection(s)`,
  },
}

const useStrings = () => {
  const { i18n } = useTranslation()
  return i18n.language.startsWith('zh') ? STRINGS.zh : STRINGS.en
}

const isIp = (value: string) =>
  /^\d{1,3}(\.\d{1,3}){3}(\/\d+)?$/.test(value) || value.includes(':')

/** `a.b.example.com` -> itself and each parent with at least two labels. */
const parentDomains = (host: string) => {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.')
  const result: string[] = []
  for (let i = 0; i <= labels.length - 2; i++) {
    result.push(labels.slice(i).join('.'))
  }
  return result
}

const readLastPolicy = () => {
  try {
    return localStorage.getItem(LAST_POLICY_KEY) ?? ''
  } catch {
    return ''
  }
}

const writeLastPolicy = (policy: string) => {
  try {
    localStorage.setItem(LAST_POLICY_KEY, policy)
  } catch {
    // Remembering the last policy is a convenience only.
  }
}

const initialTarget = (prefill?: Prefill) => {
  if (prefill?.host && !isIp(prefill.host)) {
    const domains = parentDomains(prefill.host)
    return { type: 'DOMAIN-SUFFIX', value: domains[domains.length - 1] ?? '' }
  }
  const ip = prefill?.ip || prefill?.host
  if (ip) {
    return { type: ip.includes(':') ? 'IP-CIDR6' : 'IP-CIDR', value: ip }
  }
  return { type: 'DOMAIN-SUFFIX', value: '' }
}

interface DialogProps {
  prefill?: Prefill
  onClose: () => void
  onChanged?: () => void
}

const SurgeRuleDialog = ({
  open,
  ...props
}: DialogProps & { open: boolean }) => (
  <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth>
    {/* Mounted per open so the form starts from the current prefill. */}
    {open && <RuleEditor {...props} />}
  </Dialog>
)

const RuleEditor = ({ prefill, onClose, onChanged }: DialogProps) => {
  const s = useStrings()
  const [state, setState] = useState<RulesState | null>(null)
  const [type, setType] = useState(() => initialTarget(prefill).type)
  const [value, setValue] = useState(() => initialTarget(prefill).value)
  const [policy, setPolicy] = useState('')
  const [keyword, setKeyword] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await call<RulesState>('GET', 'surge/rules')
      setState(next)
      return next
    } catch (err) {
      showNotice.error(String(err))
      return null
    }
  }, [])

  useEffect(() => {
    void load().then((next) => {
      if (!next) return
      const last = readLastPolicy()
      setPolicy(next.policies.includes(last) ? last : (next.policies[0] ?? ''))
    })
  }, [load])

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')
  const existing = state?.rules.find(
    (rule) => rule.type === type && rule.value.toLowerCase() === normalized,
  )

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    const rules = state?.rules ?? []
    if (!needle) return rules
    return rules.filter((rule) =>
      `${rule.type},${rule.value},${rule.policy}`
        .toLowerCase()
        .includes(needle),
    )
  }, [state, keyword])

  const save = useLockFn(async () => {
    try {
      const result = await call<{
        rule: string
        action: string
        closed: number
      }>('POST', 'surge/rules', { type, value, policy })
      writeLastPolicy(policy)
      if (result.action === 'unchanged') {
        showNotice.info(s.unchanged)
      } else {
        showNotice.success(s.saved(result.rule, result.closed))
        onChanged?.()
      }
      await load()
    } catch (err) {
      showNotice.error(String(err))
    }
  })

  const remove = useLockFn(async (rule: RuleEntry) => {
    try {
      const result = await call<{ rule: string; closed: number }>(
        'POST',
        'surge/rules/delete',
        { type: rule.type, value: rule.value },
      )
      showNotice.success(s.removed(result.rule, result.closed))
      onChanged?.()
      await load()
    } catch (err) {
      showNotice.error(String(err))
    }
  })

  const suggestions =
    prefill?.host && !isIp(prefill.host) ? parentDomains(prefill.host) : []

  return (
    <>
      <DialogTitle>{s.title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
          <TextField
            select
            size="small"
            label={s.type}
            value={type}
            onChange={(e) => setType(e.target.value)}
            sx={{ width: 170, flexShrink: 0 }}
          >
            {(state?.kinds ?? [type]).map((kind) => (
              <MenuItem key={kind} value={kind}>
                {kind}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            autoFocus
            size="small"
            label={s.value}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && normalized && policy) void save()
            }}
            sx={{ flex: 1 }}
          />
          <TextField
            select
            size="small"
            label={s.policy}
            value={state?.policies.includes(policy) ? policy : ''}
            onChange={(e) => setPolicy(e.target.value)}
            sx={{ width: 160, flexShrink: 0 }}
          >
            {(state?.policies ?? []).map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {suggestions.length > 1 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {suggestions.map((domain) => (
              <Chip
                key={domain}
                size="small"
                label={domain}
                color={normalized === domain ? 'primary' : 'default'}
                onClick={() => setValue(domain)}
              />
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
          <Typography variant="caption" sx={{ flex: 1, opacity: 0.7 }}>
            {s.hint}
          </Typography>
          <Button
            variant="contained"
            disabled={!normalized || !policy}
            onClick={() => void save()}
            sx={{ flexShrink: 0 }}
          >
            {existing ? s.change(existing.policy) : s.add}
          </Button>
        </Box>

        <TextField
          fullWidth
          size="small"
          placeholder={s.search}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          sx={{ mt: 2 }}
        />
        <List dense sx={{ maxHeight: 320, overflow: 'auto' }}>
          {filtered.slice(0, LIST_LIMIT).map((rule) => (
            <ListItemButton
              key={`${rule.type},${rule.value},${rule.policy}`}
              disabled={!rule.editable}
              onClick={() => {
                setType(rule.type)
                setValue(rule.value)
                setPolicy(rule.policy)
              }}
              title={rule.editable ? undefined : s.readonly}
              sx={{ pr: 6 }}
            >
              <ListItemText
                primary={rule.value}
                secondary={`${rule.type} · ${rule.policy}`}
                slotProps={{
                  primary: { sx: { wordBreak: 'break-all' } },
                }}
              />
              {rule.editable && (
                <IconButton
                  edge="end"
                  size="small"
                  sx={{ position: 'absolute', right: 16 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    void remove(rule)
                  }}
                >
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              )}
            </ListItemButton>
          ))}
        </List>
        {filtered.length > LIST_LIMIT && (
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {s.more(filtered.length - LIST_LIMIT)}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{s.close}</Button>
      </DialogActions>
    </>
  )
}

/** Rules page header entry. */
export const SurgeRuleButton = () => {
  const s = useStrings()
  const active = useSurgeActive()
  const [open, setOpen] = useState(false)
  const { refreshRules } = useAppRefreshers()

  if (!active) return null

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<EditNoteRounded />}
        onClick={() => setOpen(true)}
      >
        {s.button}
      </Button>
      <SurgeRuleDialog
        open={open}
        onClose={() => setOpen(false)}
        onChanged={() => void refreshRules()}
      />
    </>
  )
}

/** Connection detail entry, prefilled from the connection. */
export const SurgeRuleAction = ({
  connection,
}: {
  connection: IConnectionsItem
}) => {
  const s = useStrings()
  const active = useSurgeActive()
  const [open, setOpen] = useState(false)
  const { host, destinationIP } = connection.metadata
  const prefill = useMemo(
    () => ({ host, ip: destinationIP }),
    [host, destinationIP],
  )

  if (!active) return null

  return (
    <Box sx={{ textAlign: 'right', mb: 1 }}>
      <Button variant="outlined" size="small" onClick={() => setOpen(true)}>
        {s.action}
      </Button>
      <SurgeRuleDialog
        open={open}
        prefill={prefill}
        onClose={() => setOpen(false)}
      />
    </Box>
  )
}
